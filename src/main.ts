import * as core from '@actions/core'
import * as github from '@actions/github'
import {PullRequestEvent} from '@octokit/webhooks-types'

async function run(): Promise<void> {
  try {
    if (github.context.eventName === 'pull_request') {
      const payload = github.context.payload as PullRequestEvent
      const url = payload.pull_request.url
      core.info(`PR url: ${JSON.stringify(payload.pull_request)}`)
      core.info(`Action: ${payload.action}`)
      return
    }
    core.setFailed('Can only run on PR events')
    // core.setOutput('time', new Date().toTimeString())
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
