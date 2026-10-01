import { useRef, useState } from 'react';
import { ArrowUpRight, Globe2, LoaderCircle, Sparkles } from 'lucide-react';
import { useSubmitPromptMutation } from '../../services/api';
import { languages, promptSchema } from './validation';

const examples = [
  'How can we improve onboarding for new customers?',
  'Which metrics should we track during customer onboarding?',
];

export function PromptForm({ activeRequest, busy }) {
  const [prompt, setPrompt] = useState(activeRequest?.input.prompt ?? '');
  const [language, setLanguage] = useState(activeRequest?.input.targetLanguage ?? 'en');
  const [touched, setTouched] = useState(false);
  const inputRef = useRef(null);
  const [submit] = useSubmitPromptMutation();
  const validation = promptSchema.safeParse({ prompt, targetLanguage: language });
  const error = touched && !validation.success ? validation.error.issues[0].message : null;
  const clarification = activeRequest?.status === 'NEEDS_CLARIFICATION';

  async function handleSubmit(event) {
    event.preventDefault();
    if (!validation.success || busy) return;
    const contextId = activeRequest?.response?.contextId ?? activeRequest?.input.contextId;
    // Request state and errors are captured centrally by endpoint matchers.
    await submit({ ...validation.data, ...(contextId && { contextId }) });
  }
  function applyExample(value) {
    setPrompt(value);
    inputRef.current?.focus();
  }

  return (
    <section className="composer panel" aria-labelledby="composer-title">
      <div className="section-kicker">
        <span className="step-number">01</span> YOUR REQUEST
      </div>
      <h2 id="composer-title">
        A good question is
        <br />a great place to start.
      </h2>
      <p className="muted composer-description">
        Share what you’re working on and what you’d like to understand.
      </p>
      <form onSubmit={handleSubmit}>
        <div className="label-row">
          <label htmlFor="prompt">Prompt</label>
          <span>Required</span>
        </div>
        <textarea
          ref={inputRef}
          id="prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="What would you like to explore?"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'prompt-error prompt-hint' : 'prompt-hint'}
          disabled={busy}
          rows={7}
        />
        <div className="input-caption">
          <span id="prompt-hint">Be specific. A little context goes a long way.</span>
          <span className={prompt.length > 4000 ? 'text-error' : ''}>
            {prompt.length.toLocaleString()} / 4,000
          </span>
        </div>
        {error && (
          <p id="prompt-error" className="field-error">
            {error}
          </p>
        )}
        <label className="language-label" htmlFor="language">
          Target language
        </label>
        <div className="select-wrap">
          <Globe2 size={18} aria-hidden="true" />
          <select
            id="language"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            disabled={busy}
          >
            {languages.map(({ code, label }) => (
              <option key={code} value={code}>
                {label} ({code})
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="button button-primary"
          disabled={!validation.success || busy}
        >
          {busy ? (
            <>
              <LoaderCircle className="spin" size={18} /> Generating insights…
            </>
          ) : (
            <>
              <Sparkles size={18} />
              {clarification ? 'Send more details' : 'Generate insights'}
              <ArrowUpRight size={19} />
            </>
          )}
        </button>
        {clarification && (
          <p className="continuation-note">Your next submission continues this conversation.</p>
        )}
      </form>
      <div className="examples">
        <span className="section-kicker">NEED A STARTING POINT?</span>
        {examples.map((example) => (
          <button key={example} onClick={() => applyExample(example)} disabled={busy}>
            {example}
            <ArrowUpRight size={16} />
          </button>
        ))}
      </div>
      <div className="demo-note">
        <span className="demo-dot" />
        <p>
          <strong>Demo workspace</strong>
          <br />
          Explore a fixed customer-onboarding dataset in your selected language. No AI service is
          called.
        </p>
      </div>
    </section>
  );
}
