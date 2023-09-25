import asana, {Client} from 'asana'
import {info, setFailed, getInput, debug, error} from '@actions/core'
import {context} from '@actions/github'
import {PullRequest, PullRequestEvent} from '@octokit/webhooks-types'

const CUSTOM_FIELD_NAMES = {
  url: 'Github URL',
  status: 'Github Status'
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

async function run(): Promise<void> {
  try {
    info(`Event: ${context.eventName}.`)
    if (['pull_request', 'pull_request_target'].includes(context.eventName)) {
      const payload = context.payload as PullRequestEvent
      const htmlUrl = payload.pull_request.html_url
      info(`PR url: ${htmlUrl}`)
      info(`Action: ${payload.action}`)
      const customFields = await findCustomFields(ASANA_WORKSPACE_ID)

      // PR metadata
      const statusGid =
        customFields.status.enum_options?.find(
          f => f.name === getPRState(payload.pull_request)
        )?.gid || ''
      const title = `PR${payload.pull_request.number} - ${payload.pull_request.title}`

      // look for an existing task
      const prTask = await client.tasks.searchInWorkspace(ASANA_WORKSPACE_ID, {
        [`custom_fields.${customFields.url.gid}.value`]: htmlUrl
      })
      if (prTask.data.length === 0) {
        // task doesn't exist, create a new one
        info('Creating new PR task')
        const task = await client.tasks.create({
          workspace: ASANA_WORKSPACE_ID,
          // eslint-disable-next-line camelcase
          custom_fields: {
            [customFields.url.gid]: htmlUrl,
            [customFields.status.gid]: statusGid
          },
          notes: `${htmlUrl}`,
          name: title,
          projects: [PROJECT_ID]
        })
        const sectionId = getInput('move_to_section_id')
        if (sectionId) {
          await client.sections.addTask(sectionId, {task: task.gid})
        }
        // TODO: attachments
      } else {
        info(`Found task ${JSON.stringify(prTask.data[0])}`)
        const taskId = prTask.data[0].gid
        await client.tasks.updateTask(taskId, {
          name: title,
          // eslint-disable-next-line camelcase
          custom_fields: {
            [customFields.status.gid]: statusGid
          }
        })
      }
      return
    }
    info('Only runs for PR changes')
    // core.setOutput('time', new Date().toTimeString())
  } catch (e) {
    if (e instanceof Error) {
      if ((<any>e).value) {
        error((<any>e).value)
      }
      setFailed(e.message)
    }
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
  } else {
    debug(`${CUSTOM_FIELD_NAMES.url} field GID: ${githubUrlField?.gid}`)
    debug(`${CUSTOM_FIELD_NAMES.status} field GID: ${githubStatusField?.gid}`)
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
