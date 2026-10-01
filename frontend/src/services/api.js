import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({
    baseUrl: new URL('/api', window.location.origin).href,
    timeout: 15000,
  }),
  keepUnusedDataFor: 300,
  endpoints: (build) => ({
    submitPrompt: build.mutation({
      async queryFn(body, { dispatch }, _extraOptions, baseQuery) {
        const result = await baseQuery({ url: '/prompts', method: 'POST', body });
        if (result.data?.status === 'SUCCESS') {
          const data = result.data;
          // Finish seeding before fulfillment mounts the results subscriber.
          // onQueryStarted would race the subscription and fetch page 1 twice.
          await dispatch(
            api.util.upsertQueryData('getInsights', data.requestId, {
              pages: [data],
              pageParams: [1],
            }),
          );
        }
        return result;
      },
    }),
    getInsights: build.infiniteQuery({
      infiniteQueryOptions: {
        initialPageParam: 1,
        getNextPageParam: (lastPage) => lastPage.pagination.nextPage ?? undefined,
      },
      query: ({ queryArg, pageParam }) => `/requests/${queryArg}/insights?page=${pageParam}`,
    }),
  }),
});

export const { useSubmitPromptMutation, useGetInsightsInfiniteQuery } = api;

export function describeError(error) {
  if (error?.data?.message) return error.data;
  if (error?.status === 'TIMEOUT_ERROR')
    return { error: 'TIMEOUT', message: 'The request took too long. Please try again.' };
  return {
    error: 'CONNECTION_ERROR',
    message: 'Could not reach the service. Check that the API is running and try again.',
  };
}
