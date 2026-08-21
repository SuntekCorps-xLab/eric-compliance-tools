import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { EricApiError, type EricWebAuth } from '../../services/eric-api';
import {
  deletePolicyFeatureWord,
  getPolicyFeatureWords,
  savePolicyFeatureWord,
  suggestPolicyFeatureWords,
  type PolicyFeatureWordPage,
} from '../../services/policy';

interface PolicySettingsProps {
  auth: EricWebAuth;
  onInvalidSession: () => void;
  onLibraryChanged: () => void;
  showHeading?: boolean;
}

const emptyPage: PolicyFeatureWordPage = {
  items: [],
  page: 1,
  pageSize: 10,
  lastPage: 1,
  total: 0,
};

export function PolicySettings({
  auth,
  onInvalidSession,
  onLibraryChanged,
  showHeading = true,
}: PolicySettingsProps) {
  const [page, setPage] = useState(emptyPage);
  const [pageNumber, setPageNumber] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionNote, setSuggestionNote] = useState('');
  const [workingAction, setWorkingAction] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const handleError = useCallback(
    (value: unknown, fallback: string) => {
      const message = value instanceof Error ? value.message : fallback;
      setError(message);
      if (value instanceof EricApiError && value.invalidSession) onInvalidSession();
    },
    [onInvalidSession],
  );

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current?.abort();
    controllerRef.current = controller;
    void getPolicyFeatureWords(pageNumber, 10, auth, controller.signal)
      .then((nextPage) => {
        if (controllerRef.current !== controller) return;
        setPage(nextPage);
      })
      .catch((requestError: unknown) => {
        if (requestError instanceof DOMException && requestError.name === 'AbortError') return;
        if (controllerRef.current !== controller) return;
        handleError(requestError, 'ERiC could not load the policy term library.');
      })
      .finally(() => {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [auth, handleError, pageNumber, revision]);

  function refreshPage() {
    setLoading(true);
    setError('');
    setRevision((current) => current + 1);
  }

  async function handleSuggest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const word = query.trim();
    if (!word || workingAction) return;
    setWorkingAction('suggest');
    setError('');
    setSuggestionNote('');
    try {
      const result = await suggestPolicyFeatureWords(word, auth);
      setSuggestions(result.words);
      const statusNote =
        result.status === -2
          ? 'ERiC could not identify a precise policy feature. Refine the phrase and try again.'
          : result.status === -1
            ? 'These are broad suggestions. Choose only a phrase that matches the product.'
            : `${result.words.length} focused suggestion${result.words.length === 1 ? '' : 's'} returned.`;
      setSuggestionNote(
        `${statusNote} Daily suggestion usage: ${Math.min(50, result.usedToday)}/50.`,
      );
    } catch (requestError) {
      handleError(requestError, 'ERiC could not suggest a policy feature.');
    } finally {
      setWorkingAction('');
    }
  }

  async function handleSave(word: string) {
    if (workingAction) return;
    setWorkingAction(`save-${word}`);
    setError('');
    try {
      await savePolicyFeatureWord(word, auth);
      setSuggestions((current) => current.filter((candidate) => candidate !== word));
      setPageNumber(1);
      setLoading(true);
      setRevision((current) => current + 1);
      onLibraryChanged();
    } catch (requestError) {
      handleError(requestError, 'ERiC could not save this policy feature.');
    } finally {
      setWorkingAction('');
    }
  }

  async function handleDelete(id: number) {
    if (workingAction) return;
    setWorkingAction(`delete-${id}`);
    setError('');
    try {
      await deletePolicyFeatureWord(id, auth);
      setPendingDeleteId(null);
      setLoading(true);
      setRevision((current) => current + 1);
      onLibraryChanged();
    } catch (requestError) {
      handleError(requestError, 'ERiC could not delete this policy feature.');
    } finally {
      setWorkingAction('');
    }
  }

  return (
    <section
      className="policy-settings"
      id="policy-settings"
      {...(showHeading
        ? { 'aria-labelledby': 'policy-settings-title' }
        : { 'aria-label': 'Private policy feature library' })}
    >
      {showHeading ? (
        <div className="form-heading">
          <span>P002</span>
          <div>
            <h3 id="policy-settings-title">Policy settings</h3>
            <p>
              Maintain private feature terms for P002. Ready terms add 2 credits each when selected.
            </p>
          </div>
        </div>
      ) : null}

      <form className="policy-suggestion-form" onSubmit={(event) => void handleSuggest(event)}>
        <label className="field" htmlFor="policy-feature-query">
          <span>Describe a product feature</span>
          <input
            id="policy-feature-query"
            value={query}
            maxLength={100}
            placeholder="e.g. magnetic building toy"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button
          className="button button-small"
          type="submit"
          disabled={!query.trim() || Boolean(workingAction)}
        >
          {workingAction === 'suggest' ? 'Generating…' : 'Suggest terms'}
        </button>
      </form>

      {suggestionNote ? <p className="policy-settings-note">{suggestionNote}</p> : null}
      {suggestions.length ? (
        <ul className="policy-suggestions" aria-label="Suggested policy features">
          {suggestions.map((word) => (
            <li key={word}>
              <span>{word}</span>
              <button
                className="text-button"
                type="button"
                disabled={Boolean(workingAction)}
                onClick={() => void handleSave(word)}
              >
                {workingAction === `save-${word}` ? 'Adding…' : 'Add to library'}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? (
        <div className="history-error" role="alert">
          <span>{error}</span>
          <button className="text-button" type="button" onClick={refreshPage}>
            Try again
          </button>
        </div>
      ) : null}

      <div className="policy-library-heading">
        <div>
          <strong>Private feature library</strong>
          <span>{page.total} terms</span>
        </div>
        <button className="text-button" type="button" disabled={loading} onClick={refreshPage}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="result-loading" role="status">
          <span className="status-dot" /> Loading policy terms…
        </div>
      ) : page.items.length ? (
        <ul className="policy-library-list">
          {page.items.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.word}</strong>
                <span className={`policy-word-status ${item.pullStatus}`}>{item.pullStatus}</span>
              </div>
              {pendingDeleteId === item.id ? (
                <div className="inline-confirm" role="group" aria-label={`Delete ${item.word}?`}>
                  <span>Delete this term?</span>
                  <button
                    className="text-button destructive"
                    type="button"
                    disabled={Boolean(workingAction)}
                    onClick={() => void handleDelete(item.id)}
                  >
                    {workingAction === `delete-${item.id}` ? 'Deleting…' : 'Confirm'}
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => setPendingDeleteId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setPendingDeleteId(item.id)}
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="result-empty">
          <strong>No private policy terms yet.</strong>
          <p>Generate a focused suggestion above, then add it to this Shopify user's library.</p>
        </div>
      )}

      {page.total > 0 ? (
        <nav className="history-pagination" aria-label="Policy term library pages">
          <button
            className="button button-small"
            type="button"
            disabled={loading || page.page <= 1}
            onClick={() => {
              setLoading(true);
              setPageNumber((current) => Math.max(1, current - 1));
            }}
          >
            ← Previous
          </button>
          <span>
            Page {page.page} of {page.lastPage}
          </span>
          <button
            className="button button-small"
            type="button"
            disabled={loading || page.page >= page.lastPage}
            onClick={() => {
              setLoading(true);
              setPageNumber((current) => Math.min(page.lastPage, current + 1));
            }}
          >
            Next →
          </button>
        </nav>
      ) : null}
    </section>
  );
}
