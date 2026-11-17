import type { CiStatus, Comment, ForgeProvider, PullRequest, Reply, Review, ReviewDraft, Thread } from '../src/types.mts'

export interface FakeData {
  me: string
  pulls: PullRequest[]
  files?: Record<number, string[]>
  ci?: Record<string, CiStatus>
  reviews?: Record<number, Review[]>
  threads?: Record<number, { threads: Thread[]; general: Comment[] }>
  publishReviewError?: Error
  publishRepliesError?: Error
}

export type FakeProvider = ForgeProvider & {
  published: Array<{ number: number; draft: ReviewDraft }>
  replied: Array<{ number: number; replies: Reply[] }>
}

export function fakeProvider(data: FakeData): FakeProvider {
  const published: FakeProvider['published'] = []
  const replied: FakeProvider['replied'] = []
  return {
    published,
    replied,
    currentUser: async () => data.me,
    listPulls: async state => data.pulls.filter(item => item.state === state),
    getPull: async number => {
      const found = data.pulls.find(item => item.number === number)
      if (!found) throw new Error(`PR ${number} не найден`)
      return found
    },
    listPullFiles: async number => data.files?.[number] ?? [],
    getCiStatus: async sha => data.ci?.[sha] ?? { state: 'none', failed: [] },
    listReviews: async number => data.reviews?.[number] ?? [],
    listThreads: async number => data.threads?.[number] ?? { threads: [], general: [] },
    publishReview: async (number, draft) => {
      if (data.publishReviewError) throw data.publishReviewError
      published.push({ number, draft })
      return { url: `fake://${number}/review/${published.length}` }
    },
    publishReplies: async (number, replies) => {
      if (data.publishRepliesError) throw data.publishRepliesError
      replied.push({ number, replies })
    },
    pullRef: number => `refs/pull/${number}/head`,
  }
}
