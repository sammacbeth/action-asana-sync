import {Client} from 'asana'
import {info, setFailed, getInput} from '@actions/core'
import {context} from '@actions/github'
import {PullRequestEvent} from '@octokit/webhooks-types'

async function run(): Promise<void> {
  try {
    const client = Client.create({
      defaultHeaders: {
        'asana-enable': 'new_user_task_lists,new_project_templates'
      }
    }).useAccessToken(getInput('ASANA_ACCESS_TOKEN', {required: true}))

    if (context.eventName === 'pull_request') {
      const payload = context.payload as PullRequestEvent
      const url = payload.pull_request.html_url
      info(`PR url: ${url}`)
      info(`Action: ${payload.action}`)
      info(`User: ${JSON.stringify(await client.users.me())}`)
      return
    }
    setFailed('Can only run on PR events')
    // core.setOutput('time', new Date().toTimeString())
  } catch (error) {
    if (error instanceof Error) setFailed(error.message)
  }
}

run()
