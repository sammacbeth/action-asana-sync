# Asana sync action

This is a Github Action for tracking the status of Github Pull requests in Asana. It does the following:

1.  Creates tasks for each new pull request in a project.
2.  Puts these tasks in a specified Asana project (and optionally section)
3.  Makes the PR task as a subtask of Asana task referenced in PR description
4.  Syncs any change to the PR name to Asana.
5.  Syncs the PR state (Open, Closed, Draft, Merged) to an Asana custom field.
6.  Creates a subtask for each requested review and automatically resolves these once approved or merged

## Usage

Create a [workflow file](./.github/workflows/asana.yml) that runs on
`pull_request` and `pull_request_review` events:

```yml
name: 'asana sync'
on:
  pull_request_review:
  pull_request:
    types:
      - opened
      - edited
      - closed
      - reopened
      - synchronize
      - review_requested

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: duckduckgo/action-asana-sync@v1
        with:
          ASANA_ACCESS_TOKEN: ${{ secrets.ASANA_ACCESS_TOKEN }}
          ASANA_WORKSPACE_ID: ${{ secrets.ASANA_WORKSPACE_ID }}
          ASANA_PROJECT_ID: 'GID of project to create the tasks in'
```
