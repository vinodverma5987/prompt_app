import { useMemo, useState } from 'react';
import { ArrowDown, ArrowDownAZ, Check, LoaderCircle, Search, Sparkles, X } from 'lucide-react';
import { useGetInsightsInfiniteQuery, describeError } from '../../services/api';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { Notice } from '../../components/Notice';
import { InsightCard } from './InsightCard';
import { selectInsights } from './selectInsights';
const EMPTY = [];

function Results({ response }) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('original');
  const debouncedSearch = useDebouncedValue(search);
  const { currentData, isFetching, isError, error, hasNextPage, fetchNextPage, refetch } =
    useGetInsightsInfiniteQuery(response.requestId);
  const pages = currentData?.pages ?? EMPTY;
  // POST is already useful while its first page is being inserted into the cache.
  const items = useMemo(
    () => (pages.length ? pages.flatMap((page) => page.insights) : response.insights),
    [pages, response.insights],
  );
  const filtered = useMemo(
    () => selectInsights(items, debouncedSearch, sort, response.targetLanguage),
    [items, debouncedSearch, sort, response.targetLanguage],
  );
  const pagination = pages.at(-1)?.pagination ?? response.pagination;
  const canLoadMore = currentData ? hasNextPage : pagination.hasMore;
  const apiError = isError ? describeError(error) : null;
  const searching = search !== debouncedSearch;

  return (
    <>
      <div className="results-summary">
        <span className="success-label">
          <Check size={15} /> Request complete
        </span>
        <span>
          {response.targetLanguage.toUpperCase()}
          <span className="separator">/</span>
          {pagination.totalItems} insights
        </span>
      </div>
      <div className="results-toolbar">
        <div className="search-wrap">
          <Search size={18} />
          <input
            aria-label="Search insights"
            placeholder="Search insights or metadata…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          {search && (
            <button aria-label="Clear search" onClick={() => setSearch('')}>
              <X size={15} />
            </button>
          )}
        </div>
        <div className="sort-wrap">
          <ArrowDownAZ size={17} />
          <select
            aria-label="Sort insights"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="original">Original order</option>
            <option value="az">Title: A–Z</option>
            <option value="za">Title: Z–A</option>
          </select>
        </div>
      </div>
      <div className="results-count" role="status">
        {searching
          ? 'Searching…'
          : `${filtered.length} shown · ${items.length} of ${pagination.totalItems} loaded`}
        <span>Search and sort apply to loaded insights</span>
      </div>
      {apiError && (
        <Notice title="Couldn’t load insights" {...apiError}>
          <button
            className="text-button"
            disabled={isFetching}
            onClick={() => (pages.length && canLoadMore ? fetchNextPage() : refetch())}
          >
            Try again
          </button>
        </Notice>
      )}
      {filtered.length > 0 ? (
        <ol
          className={`insight-list ${searching ? 'is-searching' : ''}`}
          lang={response.targetLanguage}
          aria-busy={searching}
        >
          {filtered.map((insight, index) => (
            <InsightCard key={insight.id} insight={insight} index={index} />
          ))}
        </ol>
      ) : (
        <div className="no-results">
          <Search size={26} />
          <h3>{items.length ? 'No matching insights' : 'No insights returned'}</h3>
          <p>
            {items.length
              ? 'Try a different search or load the next page.'
              : 'Try adding more detail to your prompt.'}
          </p>
        </div>
      )}
      <div className="results-footer">
        {canLoadMore ? (
          <button
            className="button button-secondary"
            disabled={isFetching}
            onClick={() => fetchNextPage()}
          >
            {isFetching ? <LoaderCircle className="spin" size={17} /> : <ArrowDown size={17} />}{' '}
            {isFetching ? 'Loading insights…' : 'Load more insights'}
          </button>
        ) : (
          <span>
            <Check size={15} /> You’ve reached the end
          </span>
        )}
        <span>
          {items.length} / {pagination.totalItems}
        </span>
      </div>
    </>
  );
}

export function InsightsPanel({ activeRequest }) {
  return (
    <section className="results panel" aria-labelledby="results-title">
      <div className="results-heading">
        <div>
          <div className="section-kicker">
            <span className="step-number">02</span> THE RESPONSE
          </div>
          <h2 id="results-title">Room for insight.</h2>
        </div>
        <span className="response-mark">
          <Sparkles size={20} />
        </span>
      </div>
      {!activeRequest && (
        <div className="empty-results">
          <div className="empty-icon">
            <Sparkles size={30} />
          </div>
          <h3>
            A little curiosity.
            <br />A new perspective.
          </h3>
          <p>
            Submit a prompt to explore your insights.
            <br />
            They’ll be ready to search, sort, and review here.
          </p>
          <span className="empty-label">YOUR NEXT IDEA STARTS ON THE LEFT</span>
        </div>
      )}
      {activeRequest?.status === 'PENDING' && (
        <div className="loading-results" role="status">
          <LoaderCircle size={28} className="spin" />
          <h3>Putting your insights together…</h3>
          <p>Preparing a response in your selected language.</p>
        </div>
      )}
      {activeRequest?.status === 'NEEDS_CLARIFICATION' && (
        <>
          <Notice
            kind="clarification"
            title="A little more context, please"
            message={activeRequest.response.message}
          />
          <p className="clarification-help">
            Update your prompt on the left and send more details to continue.
          </p>
        </>
      )}
      {activeRequest?.status === 'ERROR' && (
        <Notice title="Your request couldn’t be completed" {...activeRequest.error} />
      )}
      {activeRequest?.status === 'SUCCESS' && (
        <Results key={activeRequest.response.requestId} response={activeRequest.response} />
      )}
    </section>
  );
}
