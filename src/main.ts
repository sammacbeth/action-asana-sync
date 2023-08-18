import asana, {Client} from 'asana'
import {info, setFailed, getInput, debug, setOutput} from '@actions/core'
import {context} from '@actions/github'
import {
  PullRequest,
  PullRequestEvent,
  PullRequestReviewEvent,
  User,
  Team
} from '@octokit/webhooks-types'

const CUSTOM_FIELD_NAMES = {
  url: 'Github URL',
  status: 'Github Status'
}

const MAIL_MAP: {[key: string]: string} = {
  mas: 'marc',
  nil: 'caine'
}

type PRState = 'Open' | 'Closed' | 'Merged' | 'Approved' | 'Draft'
const client = Client.create({
  defaultHeaders: {
    'asana-enable':
      'new_user_task_lists,new_project_templates,new_goal_memberships'
  }
}).useAccessToken(getInput('ASANA_ACCESS_TOKEN', {required: true}))
const ASANA_WORKSPACE_ID = getInput('ASANA_WORKSPACE_ID', {required: true})
const PROJECT_ID = getInput('ASANA_PROJECT_ID', {required: true})

function getUserFromLogin(login: string): string {
  let mail = MAIL_MAP[login]
  if (mail === undefined) {
    // Fall back to matching logins
    mail = login
  }
  return `${mail}@duckduckgo.com`
}

async function getOrCreateReviewSubtask(
  taskId: string,
  reviewer: string,
  subtasks: asana.resources.ResourceList<asana.resources.Tasks.Type>
): Promise<asana.resources.Tasks.Type> {
  const payload = context.payload as PullRequestEvent
  const title = payload.pull_request.title
  //  const subtasks = await client.tasks.subtasks(taskId)
  const author = getUserFromLogin(payload.pull_request.user.login)
  const reviewerEmail = getUserFromLogin(reviewer)

  let reviewSubtask
  for (let subtask of subtasks.data) {
    info(`Checking subtask ${subtask.gid} assignee`)
    subtask = await client.tasks.findById(subtask.gid)
    if (!subtask.assignee) {
      info(`Task ${subtask.gid} has no assignee`)
      continue
    }
    const asanaUser = await client.users.findById(subtask.assignee.gid)
    if (asanaUser.email === reviewerEmail) {
      info(
        `Found existing review task for ${subtask.gid} and ${asanaUser.email}`
      )
      reviewSubtask = subtask
      break
    }
  }
  info(`Subtask for ${reviewerEmail}: ${JSON.stringify(reviewSubtask)}`)
  if (!reviewSubtask) {
    info(`Creating review subtask for ${reviewerEmail}`)
    info(`Author: ${author}`)
    const subtaskObj = {
      name: `Review Request: ${title}`,
      notes: `${author} requested your code review of ${payload.pull_request.html_url}.

Please review changes and close this subtask once done.`,
      assignee: reviewerEmail,
      followers: [author, reviewerEmail]
    }
    reviewSubtask = await client.tasks.addSubtask(taskId, subtaskObj)
  }
  return reviewSubtask
}

async function createReviewSubTasks(taskId: string): Promise<void> {
  info(`Creating/updating review subtasks for task ${taskId}`)
  const payload = context.payload as PullRequestEvent
  const requestor = getUserFromLogin(payload.sender.login)
  const reviewers = payload.pull_request.requested_reviewers
  const subtasks = await client.tasks.subtasks(taskId)
  if (context.eventName === 'pull_request') {
    // Make sure we have created all subtasks for each reviewer
    for (let reviewer of reviewers) {
      // TODO do we need to fix for teams?
      reviewer = reviewer as User
      getOrCreateReviewSubtask(taskId, reviewer.login, subtasks)
    }
  } else if (context.eventName === 'pull_request_review') {
    const reviewPayload = context.payload as PullRequestReviewEvent
    const reviewer = reviewPayload.review.user
    const subtask = await getOrCreateReviewSubtask(
      taskId,
      reviewer.login,
      subtasks
    )
    info(`Processing PR review from ${reviewer.login}`)
    if (
      reviewPayload.action === 'submitted' &&
      reviewPayload.review.state === 'approved'
    ) {
      info(`Completing review subtask for ${reviewer.login}: ${subtask.gid}`)
      await client.tasks.updateTask(subtask.gid, {completed: true})
    }
  }
}

async function run(): Promise<void> {
  try {
    info(`Event: ${context.eventName}.`)
    if (
      ['pull_request', 'pull_request_target', 'pull_request_review'].includes(
        context.eventName
      )
    ) {
      const payload = context.payload as PullRequestEvent
      const htmlUrl = payload.pull_request.html_url
      const requestor = getUserFromLogin(payload.sender.login)
      info(`PR url: ${htmlUrl}`)
      info(`Action: ${payload.action}`)
      const customFields = await findCustomFields(ASANA_WORKSPACE_ID)

      // PR metadata
      const statusGid =
        customFields.status.enum_options?.find(
          f => f.name === getPRState(payload.pull_request)
        )?.gid || ''
      const title = `${payload.repository.full_name}#${payload.pull_request.number} - ${payload.pull_request.title}`
      const body = payload.pull_request.body || 'Empty description'

      if (title.startsWith('Release: ')) {
        return
      }

      // look for an existing task
      const prTask = await client.tasks.searchInWorkspace(ASANA_WORKSPACE_ID, {
        [`custom_fields.${customFields.url.gid}.value`]: htmlUrl
      })

      const notes = `
Note: This description is automatically updated from Github. Changes will be LOST.

${htmlUrl}

PR content:
${body.replace(/^---$[\s\S]*/gm, '')}`
      if (prTask.data.length === 0) {
        // task doesn't exist, create a new one
        info('Creating new PR task')

        const task = await client.tasks.create({
          assignee: requestor,
          workspace: ASANA_WORKSPACE_ID,
          // eslint-disable-next-line camelcase
          custom_fields: {
            [customFields.url.gid]: htmlUrl,
            [customFields.status.gid]: statusGid
          },
          notes,
          name: title,
          projects: [PROJECT_ID]
        })
        setOutput('task_url', task.permalink_url)
        setOutput('result', 'created')
        const sectionId = getInput('move_to_section_id')
        if (sectionId) {
          await client.sections.addTask(sectionId, {task: task.gid})
        }
        await createReviewSubTasks(task.gid)
        // TODO: attachments
      } else {
        info(`Found task ${JSON.stringify(prTask.data[0])}`)
        const taskId = prTask.data[0].gid
        setOutput('task_url', prTask.data[0].permalink_url)
        setOutput('result', 'updated')
        await client.tasks.updateTask(taskId, {
          name: title,
          notes,
          // eslint-disable-next-line camelcase
          custom_fields: {
            [customFields.status.gid]: statusGid
          }
        })
        await createReviewSubTasks(taskId)
      }
      return
    }
    info('Only runs for PR changes')
    // core.setOutput('time', new Date().toTimeString())
  } catch (error) {
    if (error instanceof Error) setFailed(error.message)
  }
}

async function findCustomFields(workspaceGid: string) {
  const apiResponse = await client.customFields.getCustomFieldsForWorkspace(
    workspaceGid
  )
  // pull all fields from the API with the streaming
  const stream = apiResponse.stream()
  const customFields: asana.resources.CustomFields.Type[] = []
  stream.on('data', field => {
    customFields.push(field)
  })
  await new Promise<void>(resolve => stream.on('end', resolve))

  const githubUrlField = customFields.find(
    f => f.name === CUSTOM_FIELD_NAMES.url
  )
  const githubStatusField = customFields.find(
    f => f.name === CUSTOM_FIELD_NAMES.status
  )
  if (!githubUrlField || !githubStatusField) {
    debug(JSON.stringify(customFields))
    throw new Error('Custom fields are missing. Please create them')
  }
  return {
    url: githubUrlField,
    status: githubStatusField as asana.resources.CustomField
  }
}

function getPRState(pr: PullRequest): PRState {
  if (pr.merged) {
    return 'Merged'
  }
  if (pr.state === 'open') {
    if (pr.draft) {
      return 'Draft'
    }
    return 'Open'
  }
  return 'Closed'
}

run()
