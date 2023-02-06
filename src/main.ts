import {info, setFailed} from '@actions/core'
import {context} from '@actions/github'
import {PullRequestEvent} from '@octokit/webhooks-types'

async function run(): Promise<void> {
  try {
    if (context.eventName === 'pull_request') {
      const payload = context.payload as PullRequestEvent
      const url = payload.pull_request.html_url
      info(`PR url: ${url}`)
      info(`Action: ${payload.action}`)

      return
    }
    setFailed('Can only run on PR events')
    // core.setOutput('time', new Date().toTimeString())
  } catch (error) {
    if (error instanceof Error) setFailed(error.message)
  }
}

run()
