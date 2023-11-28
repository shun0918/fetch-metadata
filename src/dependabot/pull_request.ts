import { Context } from '@actions/github/lib/context'
import { GitHub } from '@actions/github/lib/utils'

export const getPullRequest = async (client:InstanceType<typeof GitHub>, context: Context, prNumber: number) => {
  return (await client.rest.pulls.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
    pull_number: prNumber
  })).data
}
