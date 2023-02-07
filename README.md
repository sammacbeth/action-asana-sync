# Asana sync action

This is a Github Action for tracking the status of Github Pull requests in Asana. It does the following:
 1. Creates tasks for each new pull request in a project.
 2. Puts these tasks in a specified Asana project and section.
 3. Syncs any change to the PR name to Asana.
 4. Syncs the PR state (Open, Closed, Draft, Merged) to an Asana custom field.

## Usage

Create a [workflow file](./.github/workflows/asana.yml) that runs on `pull_request_target`:

```yml
name: 'asana sync'
on:
  pull_request_target:
    types:
      - opened
      - edited
      - closed
      - reopened
      - synchronize

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: sammacbeth/action-asana-sync@v1
        with:
          ASANA_ACCESS_TOKEN: ${{ secrets.ASANA_ACCESS_TOKEN }}
          ASANA_WORKSPACE_ID: ${{ secrets.ASANA_WORKSPACE_ID }}
          ASANA_PROJECT_ID: 'GID of project to create the tasks in'
          move_to_section_id: '(optional) project section to move tasks to'
```
