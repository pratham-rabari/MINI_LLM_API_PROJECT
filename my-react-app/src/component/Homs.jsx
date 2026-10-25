import './homs.css'
import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import { callApi } from '../services/aiServices.js';
import "katex/dist/katex.min.css";
import { v4 as uuidv4 } from 'uuid';

const getUsage = (usage = {}) => ({
  inputTokens: usage.total_input_tokens ?? usage.promptTokens ?? usage.inputTokens ?? 0,
  outputTokens: usage.total_output_tokens ?? usage.completionTokens ?? usage.outputTokens ?? 0,
  totalTokens: usage.total_tokens ?? usage.totalTokens
    ?? ((usage.total_input_tokens ?? usage.promptTokens ?? usage.inputTokens ?? 0)
      + (usage.total_output_tokens ?? usage.completionTokens ?? usage.outputTokens ?? 0)),
});

const OUTPUT_TOKEN_LIMIT = 5000;

const Homs = () => {
  const [output, setOutput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [exceededModels, setExceededModels] = useState([]);
  const [input, setInput] = useState('');
  const [Loading, setLoading] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [compareMenuOpen, setCompareMenuOpen] = useState(false);
  const [systemPromptMenuOpen, setSystemPromptMenuOpen] = useState(false);
  const [customPromptOpen, setCustomPromptOpen] = useState(false);
  const [selectedSystemPrompt, setSelectedSystemPrompt] = useState('Select system prompt');
  const [customPrompt, setCustomPrompt] = useState('');
  const [customPromptDraft, setCustomPromptDraft] = useState('');
  const [streamEnabled, setStreamEnabled] = useState(true);
  const [temperature, setTemperature] = useState(1.0);
  const [selectedTool, setSelectedTool] = useState('gemini-3.5-flash-lite');
  const [compareModels, setCompareModels] = useState(['gemini-3.5-flash-lite']);
  const [comparisonResults, setComparisonResults] = useState([]);
  const [tokenUsage, setTokenUsage] = useState({
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  })
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('multiAiHistory') || '[]');
    } catch {
      return [];
    }
  })
  const getRemainingOutputTokens = (model) => {
    const usedTokens = history
      .filter((item) => item.model === model)
      .reduce((total, item) => total + getUsage(item.usage).outputTokens, 0);

    return Math.max(0, OUTPUT_TOKEN_LIMIT - usedTokens);
  };
  const updateModelUsage = (model, historyId, usage) => {
    const normalizedUsage = getUsage(usage);
    const modelOutputTokens = history
      .filter((item) => item.model === model && item.id !== historyId)
      .reduce((total, item) => total + getUsage(item.usage).outputTokens, normalizedUsage.outputTokens);

    if (modelOutputTokens >= OUTPUT_TOKEN_LIMIT) {
      setHistory((currentHistory) => currentHistory.filter((item) => item.model !== model));
      setExceededModels((currentModels) => (
        currentModels.includes(model) ? currentModels : [...currentModels, model]
      ));
      return normalizedUsage;
    }

    setHistory((currentHistory) =>
      currentHistory.map((item) =>
        item.id === historyId
          ? { ...item, usage: normalizedUsage }
          : item
      )
    );
    return normalizedUsage;
  };
  const menuRef = useRef(null);
  const compareMenuRef = useRef(null);
  const systemPromptMenuRef = useRef(null);

  function formatGeminiHistory(history) {
    return history.flatMap((item) => [
      {
        role: "user",
        parts: [{ text: item.prompt }]
      },
      {
        role: "model",
        parts: [{ text: item.output }]
      }
    ]);
  }

  function formateToDeepseekHistory(history) {
    return history.flatMap((chat) => [
      {
        role: "user",
        content: chat.prompt
      },
      {
        role: "assistant",
        content: chat.output
      }
    ]);
  }

  useEffect(() => {
    const closeMenu = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
      if (compareMenuRef.current && !compareMenuRef.current.contains(event.target)) {
        setCompareMenuOpen(false);
      }
      if (systemPromptMenuRef.current && !systemPromptMenuRef.current.contains(event.target)) {
        setSystemPromptMenuOpen(false);
        setCustomPromptOpen(false);
      }
    };

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setCompareMenuOpen(false);
        setSystemPromptMenuOpen(false);
        setCustomPromptOpen(false);
      }
    };

    document.addEventListener('mousedown', closeMenu);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('mousedown', closeMenu);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const applyPromptTool = (label, instruction = '') => {
    setSelectedTool(label);
    setTemperature(1.0);
    setCompareModels((currentModels) => currentModels.length <= 1 ? [label] : currentModels);
    if (instruction) {
      setInput((currentInput) => currentInput ? `${instruction}: ${currentInput}` : `${instruction}: `);
    }
    setMenuOpen(false);
  };

  const toggleCompareModel = (model) => {
    setCompareModels((currentModels) => {
      if (model === selectedTool && currentModels.includes(model)) {
        return currentModels;
      }
      setTemperature(1.0);
      if (currentModels.includes(model)) {
        setComparisonResults((currentResults) => {
          const remainingResults = currentResults.filter((result) => result.model !== model);
          const currentModelResult = currentResults.find((result) => result.model === selectedTool);

          if (currentModels.length === 2 && currentModelResult) {
            setOutput(currentModelResult.output);
            setTokenUsage(currentModelResult.usage);
          }

          return remainingResults;
        });
        return currentModels.filter((currentModel) => currentModel !== model);
      }
      setComparisonResults((currentResults) => currentResults.filter((result) => result.model !== model));
      return currentModels.length < 3 ? [...currentModels, model] : currentModels;
    });
  };

  const apiCall = async () => {
    try {
      setOutput('');
      setTokenUsage({
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      });
      setErrorMsg('');
      if (!input) {
        return setErrorMsg('Input is required');
      }
      const prompt = input;
      const requestModels = compareModels.length > 0 ? compareModels : [selectedTool];
      const requestTokenLimits = new Map(
        requestModels.map((model) => [model, getRemainingOutputTokens(model)])
      );
      const exhaustedModels = requestModels.filter((model) => requestTokenLimits.get(model) === 0);

      if (exhaustedModels.length > 0) {
        setHistory((currentHistory) =>
          currentHistory.filter((item) => !exhaustedModels.includes(item.model))
        );
        setExceededModels((currentModels) => [
          ...new Set([...currentModels, ...exhaustedModels]),
        ]);
      }
      if (requestModels.length === 1 && exhaustedModels.length === 1) {
        return;
      }

      setLoading(true);
      setInput('');

      if (requestModels.length > 1) {
        setComparisonResults(requestModels.map((model) => ({
          model,
          output: '',
          error: '',
          loading: true,
          usage: null,
        })));

        const comparisonHistoryIds = new Map(
          requestModels.map((model) => [model, uuidv4()])
        );
        setHistory((currentHistory) => [
          ...currentHistory,
          ...requestModels
            .filter((model) => requestTokenLimits.get(model) > 0)
            .map((model) => ({
              id: comparisonHistoryIds.get(model),
              model,
              prompt,
              output: '',
              usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            })),
        ]);
        await Promise.all(requestModels.map(async (model) => {
          if (requestTokenLimits.get(model) === 0) {
            setComparisonResults((currentResults) => currentResults.map((result) => (
              result.model === model
                ? { ...result, loading: false, error: 'Token limit reached; chat history cleared.' }
                : result
            )));
            return;
          }
          let bufferedOutput = '';
          const contextHistory = history.filter((item) => item.model === model);
          let context;

          if (model === 'deepseek-v4-flash-0731' || model === 'gemma4:31b') {
            context = formateToDeepseekHistory(contextHistory);
          } else if (model === 'gemini-3.5-flash-lite' || model === 'gemini-3.8-flash') {
            context = formatGeminiHistory(contextHistory);
          }
          try {
            let responseText = '';
            await callApi(
              prompt,
              model,
              selectedSystemPrompt ? selectedSystemPrompt : customPrompt,
              streamEnabled,
              (chunk) => {
                responseText += chunk;
                if (streamEnabled) {
                  setComparisonResults((currentResults) => currentResults.map((result) => (
                    result.model === model
                      ? { ...result, output: result.output + chunk }
                      : result
                  )));
                  setHistory((currentHistory) => currentHistory.map((item) =>
                    item.id === comparisonHistoryIds.get(model)
                      ? { ...item, output: responseText }
                      : item
                  ));
                } else {
                  bufferedOutput += chunk;
                }
              },
              (usage) => {
                const normalizedUsage = updateModelUsage(
                  model,
                  comparisonHistoryIds.get(model),
                  usage
                );
                setComparisonResults((currentResults) => currentResults.map((result) => (
                  result.model === model
                    ? { ...result, usage: normalizedUsage }
                    : result
                )));
              },
              temperature,
              requestTokenLimits.get(model),
              context,
            );

            setComparisonResults((currentResults) => currentResults.map((result) => (
              result.model === model
                ? { ...result, output: streamEnabled ? result.output : bufferedOutput, loading: false }
                : result
            )));
            if (!streamEnabled) {
              setHistory((currentHistory) => currentHistory.map((item) =>
                item.id === comparisonHistoryIds.get(model)
                  ? { ...item, output: responseText }
                  : item
              ));
            }
          } catch (error) {
            setComparisonResults((currentResults) => currentResults.map((result) => (
              result.model === model
                ? { ...result, error: error.message, loading: false }
                : result
            )));
          }
        }));
      } else {
        let responseText = '';
        let bufferedOutput = '';
        const historyId = uuidv4();
        const model = requestModels[0];
        const contextHistory = history.filter((item) => item.model === model);
        let context;

        if (model === 'deepseek-v4-flash-0731' || model === 'gemma4:31b') {
          context = formateToDeepseekHistory(contextHistory);
        } else if (model === 'gemini-3.5-flash-lite' || model === 'gemini-3.8-flash') {
          context = formatGeminiHistory(contextHistory);
        }

        setHistory((currentHistory) => [
          ...currentHistory,
          {
            id: historyId,
            model: requestModels[0],
            prompt,
            output: '',
            usage: {
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0
            }
          },
        ]);
        await callApi(
          prompt,
          requestModels[0],
          selectedSystemPrompt ? selectedSystemPrompt : customPrompt,
          streamEnabled,
          (chunk) => {
            responseText += chunk;
            console.log("chunk", chunk);
            if (streamEnabled) {
              setHistory((currentHistory) =>
                currentHistory.map((item) =>
                  item.id === historyId
                    ? { ...item, output: responseText } : item));
              // setOutput((currentOutput) => currentOutput + chunk);
            }
          },

          (usage) => {
            const normalizedUsage = updateModelUsage(model, historyId, usage);
            setTokenUsage(normalizedUsage);
          },
          temperature,
          requestTokenLimits.get(model),
          context,
        );
        if (!streamEnabled) {
          setHistory((currentHistory) => currentHistory.map((item) =>
            item.id === historyId
              ? { ...item, output: responseText }
              : item
          ));
          // setOutput(bufferedOutput);
        }

      }
      setLoading(false);
      setOutput('');
    } catch (error) {
      setLoading(false);
      setErrorMsg(error.message);
    }
  }



  useEffect(() => {
    localStorage.setItem('multiAiHistory', JSON.stringify(history));
  }, [history]);

  const isComparing = compareModels.length > 1 && comparisonResults.length > 0;
  const selectedModelHistory = history.filter((item) => item.model === selectedTool);
  const chatUsage = selectedModelHistory.reduce((total, item) => {
    const usage = getUsage(item.usage);
    return {
      inputTokens: total.inputTokens + usage.inputTokens,
      outputTokens: total.outputTokens + usage.outputTokens,
      totalTokens: total.totalTokens + usage.totalTokens,
    };
  }, { inputTokens: 0, outputTokens: 0, totalTokens: 0 });

  return (
    <div className="Main">
      <div className="top-box">
        <div className="title-bar">
          <div className="system-prompt-wrap" ref={systemPromptMenuRef}>
            {systemPromptMenuOpen && <div className="system-prompt-menu" role="menu" aria-label="System prompt">
              {!customPromptOpen ? (
                <>
                  <div className="system-prompt-heading">System prompt</div>
                  {['Teacher', 'Code reviewer', 'Interviewer', 'Coding assistant', 'None'].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      role="menuitemradio"
                      aria-checked={selectedSystemPrompt === prompt}
                      className={selectedSystemPrompt === prompt ? 'selected' : ''}
                      onClick={() => {
                        setSelectedSystemPrompt(prompt);
                        console.log(selectedSystemPrompt);
                        setSystemPromptMenuOpen(false);
                        setCustomPrompt('');
                      }}
                    >
                      <span>{prompt}</span>
                      {selectedSystemPrompt === prompt && <span className="system-prompt-check" aria-hidden="true">&#10003;</span>}
                    </button>
                  ))}
                  <div className="system-prompt-divider" />
                  <button type="button" role="menuitem" className="add-custom-prompt" onClick={() => {
                    setCustomPromptDraft(customPrompt);
                    setCustomPromptOpen(true);
                  }}>
                    <span className="custom-prompt-plus" aria-hidden="true">+</span>
                    <span>Add a custom prompt</span>
                  </button>
                  {customPrompt.trim() && (
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={selectedSystemPrompt === 'Custom prompt'}
                      className={selectedSystemPrompt === 'Custom prompt' ? 'selected custom-prompt-option' : 'custom-prompt-option'}
                      onClick={() => {
                        setSelectedSystemPrompt('Custom prompt');
                        setSystemPromptMenuOpen(false);
                      }}
                    >
                      <span className="custom-prompt-option-text">
                        <p>{customPrompt}</p>
                      </span>
                      {selectedSystemPrompt === 'Custom prompt' && <span className="system-prompt-check" aria-hidden="true">&#10003;</span>}
                    </button>
                  )}
                </>
              ) : (
                <form className="custom-prompt-editor" onSubmit={(event) => {
                  event.preventDefault();
                  if (customPromptDraft.trim()) {
                    setCustomPrompt(customPromptDraft);
                    setSelectedSystemPrompt('Custom prompt');
                    setCustomPromptOpen(false);
                    setSystemPromptMenuOpen(false);
                  }
                }}>
                  <label htmlFor="custom-system-prompt">{customPrompt ? 'Edit custom prompt' : 'Custom prompt'}</label>
                  <textarea
                    id="custom-system-prompt"
                    value={customPromptDraft}
                    onChange={(event) => setCustomPromptDraft(event.target.value)}
                    placeholder="Describe how the assistant should respond..."
                    rows="4"
                    autoFocus
                  />
                  <div className="custom-prompt-actions">
                    <button type="button" onClick={() => setCustomPromptOpen(false)}>Cancel</button>
                    <button type="submit" disabled={!customPromptDraft.trim()}>Save prompt</button>
                  </div>
                </form>
              )}
            </div>}
            <button
              type="button"
              className={`system-prompt-button${systemPromptMenuOpen ? ' active' : ''}`}
              aria-expanded={systemPromptMenuOpen}
              aria-haspopup="menu"
              onClick={() => {
                setSystemPromptMenuOpen((isOpen) => !isOpen);
                setCustomPromptOpen(false);
              }}
            >
              <span className="system-prompt-button-label">{selectedSystemPrompt}</span>
              <span className="tools-arrow" aria-hidden="true">&#8595;</span>
            </button>
          </div>
          <div className="stream-control" role="group" aria-label="Stream response">
            <span className="stream-control-label">Stream</span>
            <div className="stream-control-options">
              <button
                type="button"
                className={streamEnabled ? 'active' : ''}
                aria-pressed={streamEnabled}
                disabled={Loading}
                onClick={() => setStreamEnabled(true)}
              >
                On
              </button>
              <button
                type="button"
                className={!streamEnabled ? 'active active-off' : ''}
                aria-pressed={!streamEnabled}
                disabled={Loading}
                onClick={() => setStreamEnabled(false)}
              >
                Off
              </button>
            </div>
          </div>
          <div className="app-heading">
            <h4 className="text-center">Welcome to MultiAi!</h4>
            <p>Max output token limit per model is 5000</p>
          </div>
          <div className="compare-menu-wrap" ref={compareMenuRef}>
            {compareMenuOpen && <div className="compare-menu" role="menu" aria-label="Compare models">
              <div className="prompt-menu-heading">Select 2 to 3 models</div>
              {['gemma4:31b', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'deepseek-v4-flash-0731'].map((model) => {
                const isSelected = compareModels.includes(model);
                return (
                  <button
                    key={model}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={isSelected}
                    className={isSelected ? 'selected' : ''}
                    onClick={() => toggleCompareModel(model)}
                  >
                    <span className="prompt-menu-icon">Aa</span>
                    <span><strong>{model}</strong></span>
                    {isSelected && <span className="selected-mark">&#10003;</span>}
                  </button>
                );
              })}
            </div>}
            <button
              type="button"
              className={`compare-button${compareMenuOpen ? ' active' : ''}`}
              aria-label="Compare models"
              aria-expanded={compareMenuOpen}
              onClick={() => setCompareMenuOpen((isOpen) => !isOpen)}
            >
              <span>Compare model</span>
              <span className="tools-arrow" aria-hidden="true">&#8595;</span>
            </button>
          </div>
          <div className="temperature-control">
            <label htmlFor="temperature-slider">Temperature</label>
            <input
              id="temperature-slider"
              type="range"
              min="0.1"
              max="2.0"
              step="0.1"
              value={temperature}
              aria-valuetext={temperature.toFixed(1)}
              onChange={(event) => setTemperature(Number(event.target.value))}
            />
            <output htmlFor="temperature-slider">{temperature.toFixed(1)}</output>
          </div>
        </div>
        <div className={`max-output-row${isComparing ? ' comparison-max-output-row' : ''}`}>
          <div className="max-output-control" role="status" aria-live="polite">
            <span className="max-output-label">
              {isComparing ? 'Remaining tokens per model' : 'Remaining output tokens'}
            </span>
            {isComparing ? compareModels.map((model) => (
              <span className="remaining-token-count" key={model}>
                {model}: {getRemainingOutputTokens(model)}
              </span>
            )) : (
              <output className="remaining-token-count">{getRemainingOutputTokens(selectedTool)}</output>
            )}
          </div>
        </div>
      </div>
      <div className={`page container my-3${isComparing ? ' comparison-page' : ''}`}>
        {isComparing ? (
          <div className="comparison-grid">
            {compareModels.map((model) => {
              const result = comparisonResults.find((comparisonResult) => comparisonResult.model === model);
              const modelHistory = history.filter((item) => item.model === model);
              const modelUsage = modelHistory.reduce((total, item) => {
              const usage = getUsage(item.usage);
                return {
                  inputTokens: total.inputTokens + usage.inputTokens,
                  outputTokens: total.outputTokens + usage.outputTokens,
                  totalTokens: total.totalTokens + usage.totalTokens,
                };
              }, { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
              return (
                <section className="comparison-card" key={model}>
                  <h5 className="comparison-model-name">
                    <span className="comparison-model-label">{model}</span>
                  </h5>
                  <div className="comparison-output">
                    {modelHistory.length > 0 && (
                      <div className="usage-info">
                        <p>Model chat usage: {modelUsage.inputTokens} (Input) / {modelUsage.outputTokens} (Output) / {modelUsage.totalTokens} (Total)</p>
                      </div>
                    )}
                    {modelHistory.map((item) =>
                      <div className="history-entry" key={item.id}>
                        <div className="history-prompt">
                          <div className="history-prompt-content">{item?.prompt}</div>
                        </div>
                        <div className="history-response">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {item.output}
                          </ReactMarkdown>
                        </div>
                        <div className="usage-info">
                          <p>Token Usage: {getUsage(item.usage).inputTokens} (Input) / {getUsage(item.usage).outputTokens} (Output) / {getUsage(item.usage).totalTokens} (Total)</p>
                        </div>
                      </div>
                    )}
                    {result?.loading && !result?.output ? <p className="comparison-status">Loading...</p> : null}
                    {!result?.loading && result?.error && <p className="comparison-error">{result.error}</p>}
                    {!result && !Loading && <p className="comparison-status">Send a prompt to compare.</p>}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <>
            <div>
              {selectedModelHistory.length > 0 && (
                <div className="usage-info">
                  <p>Chat token usage: {chatUsage.inputTokens} (Input) / {chatUsage.outputTokens} (Output) / {chatUsage.totalTokens} (Total)</p>
                </div>
              )}
            </div>
            {Loading && (
              <p className="text-center">Loading...</p>
            )}
            {selectedModelHistory.map((item) => (
              <div className="history-entry" key={item.id}>
                <div className="history-prompt">
                  <div className="history-prompt-content">{item?.prompt}</div>
                </div>
                <div className="history-response">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {item.output}
                  </ReactMarkdown>
                </div>
                <div className="usage-info">
                  <p>Token Usage: {getUsage(item.usage).inputTokens} (Input) / {getUsage(item.usage).outputTokens} (Output) / {getUsage(item.usage).totalTokens} (Total)</p>
                </div>
              </div>

            ))}
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
            >
              {output}
            </ReactMarkdown>
          </>
        )}
      </div>
      {errorMsg && <h3 className="text-center text-danger">{errorMsg}</h3>}
      {exceededModels.length > 0 && (
        <div className="token-limit-backdrop">
          <section
            className="token-limit-alert"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="token-limit-title"
            aria-describedby="token-limit-message"
          >
            <div className="token-limit-icon" aria-hidden="true">!</div>
            <h2 id="token-limit-title">Chat history cleared</h2>
            <p id="token-limit-message">
              {exceededModels.join(', ')} {exceededModels.length === 1 ? 'has' : 'have'} exceeded
              {' '}5,000 output tokens. The saved chat history for {exceededModels.length === 1 ? 'this model has' : 'these models have'} been cleared.
            </p>
            <button type="button" onClick={() => setExceededModels([])} autoFocus>
              Continue
            </button>
          </section>
        </div>
      )}
      <div className="input-container container my-2" ref={menuRef}>
        {menuOpen && <div className="prompt-menu" role="menu">
          <div className="prompt-menu-heading">Prompt tools</div>
          <button type="button" role="menuitem" className={selectedTool === 'gemma4:31b' ? 'selected' : ''} onClick={() => applyPromptTool('gemma4:31b')}>
            <span className="prompt-menu-icon">All</span>
            <span><strong>gemma4:31b</strong><small></small></span>
            {selectedTool === 'gemma4:31b' && <span className="selected-mark">&#10003;</span>}
          </button>
          <button type="button" role="menuitem" className={selectedTool === 'gemini-3.5-flash-lite' ? 'selected' : ''} onClick={() => applyPromptTool('gemini-3.5-flash-lite')}>
            <span className="prompt-menu-icon">Aa</span>
            <span><strong>gemini-3.5-flash-lite</strong></span>
            {selectedTool === 'gemini-3.5-flash-lite' && <span className="selected-mark">&#10003;</span>}
          </button>
          <button type="button" role="menuitem" className={selectedTool === 'gemini-3.8-flash' ? 'selected' : ''} onClick={() => applyPromptTool('gemini-3.8-flash')}>
            <span className="prompt-menu-icon">Aa</span>
            <span><strong>gemini-3.8-flash</strong></span>
            {selectedTool === 'gemini-3.8-flash' && <span className="selected-mark">&#10003;</span>}
          </button>
          <button type="button" role="menuitem" className={selectedTool === 'deepseek-v4-flash-0731' ? 'selected' : ''} onClick={() => applyPromptTool('deepseek-v4-flash-0731')}>
            <span className="prompt-menu-icon">1-2</span>
            <span><strong>deepseek-v4-flash-0731</strong><small></small></span>
            {selectedTool === 'deepseek-v4-flash-0731' && <span className="selected-mark">&#10003;</span>}
          </button>
        </div>}
        <button
          type="button"
          className={`tools-button${menuOpen ? ' active' : ''}`}
          aria-label="Open prompt tools"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((isOpen) => !isOpen)}
        >
          <strong className="tools-label">{selectedTool}</strong>
          <span className="tools-arrow" aria-hidden="true">&#8593;</span>
        </button>
        <input type="text" placeholder="Ask anything..." value={input} onChange={(e) => setInput(e.target.value)} />
        <button disabled={Loading}
          className={`send-button${Loading ? ' change-btn' : ''}`} onClick={apiCall}>Send</button>
      </div>
    </div>
  )
}

export default Homs
