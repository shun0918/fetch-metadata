import * as core from '@actions/core'
import * as github from '@actions/github'
import { RequestError } from '@octokit/request-error'
import * as verifiedCommits from './dependabot/verified_commits'
import * as updateMetadata from './dependabot/update_metadata'
import * as output from './dependabot/output'
import * as util from './dependabot/util'

export async function run (): Promise<void> {
  const token = core.getInput('github-token')

  if (!token) {
    /* eslint-disable no-template-curly-in-string */
    core.setFailed(
      'github-token is not set! Please add \'github-token: "${{ secrets.GITHUB_TOKEN }}"\' to your workflow file.'
    )
    /* eslint-enable no-template-curly-in-string */
    return
  }

  try {
    const githubClient = github.getOctokit(token)

    // Note: Please be aware that overwriting github.context might impact the behavior.
    // This code assumes Github Actions is intended to be triggered only when using workflow_run.
    // If other triggers are expected, additional adjustments may be needed.
    if (!github.context.payload.pull_request && github.context.eventName === 'workflow_run') {
      core.warning( "Event payload missing `pull_request` key.")

      let prNumber = Number(core.getInput('pr-number'))
      if (prNumber) {
        core.debug(`Using PR number ${prNumber} instead of payload`)
        const { data: prData } = await githubClient.rest.pulls.get({
          owner: github.context.repo.owner,
          repo: github.context.repo.repo,
          pull_number: prNumber
        })
        github.context.payload.pull_request = { ...prData, body: prData.body ?? undefined };
      }
    }

    // Validate the job
    const commitMessage = await verifiedCommits.getMessage(githubClient, github.context, core.getBooleanInput('skip-commit-verification'), core.getBooleanInput('skip-verification'))
    const branchNames = util.getBranchNames(github.context)
    const body = util.getBody(github.context)
    let alertLookup: updateMetadata.alertLookup | undefined
    if (core.getInput('alert-lookup')) {
      alertLookup = (name, version, directory) => verifiedCommits.getAlert(name, version, directory, githubClient, github.context)
    }
    const scoreLookup = core.getInput('compat-lookup') ? verifiedCommits.getCompatibility : undefined

    if (commitMessage) {
      // Parse metadata
      core.info('Parsing Dependabot metadata')

      const updatedDependencies = await updateMetadata.parse(commitMessage, body, branchNames.headName, branchNames.baseName, alertLookup, scoreLookup)

      if (updatedDependencies.length > 0) {
        output.set(updatedDependencies)
      } else {
        core.setFailed('PR does not contain metadata, nothing to do.')
      }
    } else {
      core.setFailed('PR is not from Dependabot, nothing to do.')
    }
  } catch (error) {
    if (error instanceof RequestError) {
      core.setFailed(`Api Error: (${error.status}) ${error.message}`)
      return
    }
    if (error instanceof Error) {
      core.setFailed(error.message)
    } else {
      core.setFailed('There was an unexpected error.')
    }
  }
}

run()
