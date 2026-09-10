(function installDsmLearningRuntime(global) {
  'use strict';

  var STORAGE_PREFIX = 'dsm-learning:';
  var FILTERS = Object.freeze([
    {
      key: 'area',
      label: '영역',
      options: [['', '전체 영역'], ['backend', '백엔드'], ['frontend', '프런트엔드']],
    },
    {
      key: 'language',
      label: '언어',
      options: [['', '전체 언어']],
    },
    {
      key: 'kind',
      label: '종류',
      options: [['', '전체 종류'], ['source', '소스'], ['test', '테스트']],
    },
    {
      key: 'read',
      label: '읽음',
      options: [['', '전체 상태'], ['read', '읽음'], ['unread', '읽지 않음']],
    },
    {
      key: 'batch',
      label: '배치',
      options: [['', '전체 배치'], ['processed', '학습 가능'], ['remaining', '후속 배치']],
    },
  ]);

  function normalizeQuery(value) {
    return String(value == null ? '' : value)
      .normalize('NFKC')
      .toLocaleLowerCase('ko-KR')
      .replace(/[_./\\:-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function matchesReadFilter(item, value) {
    if (!value) return true;
    return value === 'read' ? item.read === true : item.read !== true;
  }

  function filterSearch(items, query, filters) {
    var normalizedQuery = normalizeQuery(query);
    var terms = normalizedQuery ? normalizedQuery.split(' ') : [];
    var selected = filters || {};

    return Array.from(items || []).filter(function match(item) {
      if (selected.area && item.area !== selected.area) return false;
      if (selected.language && item.language !== selected.language) return false;
      if (selected.kind && item.kind !== selected.kind) return false;
      if (selected.batch && item.status !== selected.batch) return false;
      if (!matchesReadFilter(item, selected.read)) return false;

      var searchable = normalizeQuery([
        item.path,
        item.filename,
        Array.isArray(item.symbols) ? item.symbols.join(' ') : '',
      ].join(' '));
      return terms.every(function includesTerm(term) {
        return searchable.includes(term);
      });
    });
  }

  function createStorageAdapter(candidate) {
    var memory = new Map();
    var persistent = true;

    try {
      if (!candidate || typeof candidate.getItem !== 'function') {
        throw new Error('storage unavailable');
      }
      candidate.getItem(STORAGE_PREFIX + 'probe');
    } catch (_) {
      persistent = false;
    }

    return {
      get persistent() {
        return persistent;
      },
      get: function get(key) {
        if (persistent) {
          try {
            var stored = candidate.getItem(STORAGE_PREFIX + key);
            return stored == null ? memory.get(key) : stored;
          } catch (_) {
            persistent = false;
          }
        }
        return memory.get(key);
      },
      set: function set(key, value) {
        var stringValue = String(value);
        memory.set(key, stringValue);
        if (persistent) {
          try {
            candidate.setItem(STORAGE_PREFIX + key, stringValue);
          } catch (_) {
            persistent = false;
          }
        }
      },
      remove: function remove(key) {
        memory.delete(key);
        if (persistent) {
          try {
            candidate.removeItem(STORAGE_PREFIX + key);
          } catch (_) {
            persistent = false;
          }
        }
      },
    };
  }

  async function copySourceText(text, documentRef, writer) {
    var exactText = String(text);
    if (typeof writer === 'function') {
      await writer(exactText);
      return true;
    }

    if (
      global.navigator &&
      global.navigator.clipboard &&
      typeof global.navigator.clipboard.writeText === 'function'
    ) {
      await global.navigator.clipboard.writeText(exactText);
      return true;
    }

    if (!documentRef || typeof documentRef.createElement !== 'function') {
      throw new Error('CLIPBOARD_UNAVAILABLE');
    }

    var textarea = documentRef.createElement('textarea');
    textarea.value = exactText;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    documentRef.body.appendChild(textarea);
    textarea.select();
    var copied = documentRef.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('CLIPBOARD_COPY_FAILED');
    return true;
  }

  function clampNumber(value, minimum, maximum, fallback) {
    var numeric = Number(value);
    if (!Number.isFinite(numeric)) numeric = fallback;
    return Math.min(maximum, Math.max(minimum, numeric));
  }

  function clampTransform(transform) {
    var value = transform || {};
    return {
      x: clampNumber(value.x, -1200, 1200, 0),
      y: clampNumber(value.y, -1200, 1200, 0),
      scale: clampNumber(value.scale, 0.75, 2.5, 1),
    };
  }

  function readJsonArray(storage, key) {
    try {
      var value = JSON.parse(storage.get(key) || '[]');
      return Array.isArray(value) ? value.map(String) : [];
    } catch (_) {
      return [];
    }
  }

  function setPressed(button, active) {
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  function setSelected(button, active) {
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  }

  function createOption(documentRef, value, label) {
    var option = documentRef.createElement('option');
    option.value = value;
    option.textContent = label;
    return option;
  }

  function findSiteRootUrl(documentRef) {
    try {
      var script = documentRef.querySelector('script[src$="assets/site-data.js"]');
      if (!script) return null;
      return new URL('../', script.src || script.getAttribute('src'), documentRef.baseURI);
    } catch (_) {
      return null;
    }
  }

  function recordHref(record, siteRootUrl) {
    if (!record || record.status !== 'processed' || !record.outputPath) return null;
    try {
      return siteRootUrl ? new URL(record.outputPath, siteRootUrl).href : record.outputPath;
    } catch (_) {
      return record.outputPath;
    }
  }

  function initSearch(documentRef, data, readPaths) {
    var openButton = documentRef.querySelector('[data-search-open]');
    var panel = documentRef.querySelector('[data-search-panel]');
    var input = documentRef.querySelector('[data-search-input]');
    var filtersHost = documentRef.querySelector('[data-search-filters]');
    var resultsHost = documentRef.querySelector('[data-search-results]');
    if (!panel || !input || !filtersHost || !resultsHost) return;

    var records = Array.from((data && (data.search || data.records)) || []).map(function (item) {
      return Object.assign({}, item, { read: readPaths.has(item.path) });
    });
    var selected = {};
    var siteRootUrl = findSiteRootUrl(documentRef);
    var timer = null;

    function renderResults() {
      var matches = filterSearch(records, input.value, selected).slice(0, 60);
      resultsHost.replaceChildren();

      var summary = documentRef.createElement('p');
      summary.className = 'search-summary';
      summary.textContent = matches.length + '개 결과';
      resultsHost.appendChild(summary);

      var list = documentRef.createElement('ul');
      list.className = 'search-results';
      matches.forEach(function renderRecord(record) {
        var item = documentRef.createElement('li');
        item.className = 'search-result';
        var destination = recordHref(record, siteRootUrl);
        var title = destination
          ? documentRef.createElement('a')
          : documentRef.createElement('strong');
        if (destination) title.href = destination;
        title.textContent = record.path;
        item.appendChild(title);

        var meta = documentRef.createElement('small');
        meta.textContent = [
          record.language || '',
          record.kind === 'test' ? '테스트' : '소스',
          destination ? '학습 가능' : '후속 배치',
          record.read ? '읽음' : '읽지 않음',
        ].filter(Boolean).join(' · ');
        item.appendChild(meta);
        list.appendChild(item);
      });
      resultsHost.appendChild(list);
    }

    FILTERS.forEach(function renderFilter(definition) {
      var label = documentRef.createElement('label');
      label.className = 'search-filter';
      var labelText = documentRef.createElement('span');
      labelText.className = 'visually-hidden';
      labelText.textContent = definition.label;
      var select = documentRef.createElement('select');
      select.setAttribute('aria-label', definition.label);

      var options = definition.options.slice();
      if (definition.key === 'language') {
        Array.from(new Set(records.map(function (record) { return record.language; }).filter(Boolean)))
          .sort()
          .forEach(function addLanguage(language) {
            options.push([language, language]);
          });
      }
      options.forEach(function appendOption(option) {
        select.appendChild(createOption(documentRef, option[0], option[1]));
      });
      select.addEventListener('change', function updateFilter() {
        selected[definition.key] = select.value;
        renderResults();
      });
      label.append(labelText, select);
      filtersHost.appendChild(label);
    });

    input.addEventListener('input', function scheduleSearch() {
      global.clearTimeout(timer);
      timer = global.setTimeout(renderResults, 120);
    });

    if (openButton) {
      openButton.addEventListener('click', function toggleSearch() {
        panel.hidden = !panel.hidden;
        openButton.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
        if (!panel.hidden) {
          input.focus();
          renderResults();
        }
      });
      openButton.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
    }
  }

  function initTheme(documentRef, storage) {
    var root = documentRef.documentElement;
    var button = documentRef.querySelector('[data-theme-toggle]');
    var stored = storage.get('theme');
    var theme = stored === 'dark' ? 'dark' : 'light';

    function apply(nextTheme) {
      theme = nextTheme;
      root.setAttribute('data-theme', theme);
      if (button) {
        button.textContent = theme === 'dark' ? '라이트 모드' : '다크 모드';
        setPressed(button, theme === 'dark');
      }
    }

    apply(theme);
    if (button) {
      button.addEventListener('click', function toggleTheme() {
        apply(theme === 'dark' ? 'light' : 'dark');
        storage.set('theme', theme);
      });
    }
  }

  function initReadState(documentRef, storage, readPaths) {
    var page = documentRef.querySelector('[data-file-page]');
    var buttons = Array.from(documentRef.querySelectorAll('[data-read-toggle]'));
    if (!page || buttons.length === 0) return;
    var sourcePath = page.getAttribute('data-source-path');

    function render() {
      var isRead = readPaths.has(sourcePath);
      buttons.forEach(function updateButton(button) {
        button.textContent = isRead ? '읽음 해제' : '읽음';
        setPressed(button, isRead);
      });
      page.setAttribute('data-read', isRead ? 'true' : 'false');
    }

    buttons.forEach(function bindReadButton(button) {
      button.addEventListener('click', function toggleRead() {
        if (readPaths.has(sourcePath)) readPaths.delete(sourcePath);
        else readPaths.add(sourcePath);
        storage.set('read', JSON.stringify(Array.from(readPaths).sort()));
        render();
      });
    });
    render();
  }

  function initFileTabs(documentRef, storage) {
    var tabs = Array.from(documentRef.querySelectorAll('[data-file-tab]'));
    if (tabs.length === 0) return;
    var page = documentRef.querySelector('[data-file-page]');
    var sourcePath = page ? page.getAttribute('data-source-path') : 'page';
    var explanationSections = Array.from(documentRef.querySelectorAll('[data-explanation]'));
    var sourcePanel = documentRef.querySelector('[data-source-code]');
    var explanationPanel = documentRef.querySelector('[data-mobile-panel="explanation"]');
    var sectionMap = { risk: 3, exercise: 4 };

    function showExplanation(kind) {
      explanationSections.forEach(function toggle(section) {
        section.hidden = section.getAttribute('data-explanation') !== kind;
      });
    }

    function activate(name, shouldScroll) {
      tabs.forEach(function updateTab(tab) {
        setSelected(tab, tab.getAttribute('data-file-tab') === name);
      });
      if (name === 'child' || name === 'junior') {
        showExplanation(name);
        if (shouldScroll && explanationPanel) explanationPanel.scrollIntoView({ block: 'start' });
      } else {
        explanationSections.forEach(function reveal(section) { section.hidden = false; });
        if (name === 'source' && sourcePanel && shouldScroll) {
          sourcePanel.scrollIntoView({ block: 'start' });
        }
        var targetIndex = sectionMap[name];
        var target = explanationPanel && explanationPanel.querySelectorAll('section')[targetIndex];
        if (target && shouldScroll) target.scrollIntoView({ block: 'start' });
      }
      storage.set('disclosure:' + sourcePath, name);
    }

    tabs.forEach(function bindTab(tab) {
      tab.addEventListener('click', function selectTab() {
        activate(tab.getAttribute('data-file-tab'), true);
      });
    });
    activate(storage.get('disclosure:' + sourcePath) || 'junior', false);
  }

  function initMobileControls(documentRef) {
    var page = documentRef.querySelector('[data-file-page]');
    if (!page) return;
    var modeButtons = Array.from(documentRef.querySelectorAll('[data-mobile-mode]'));
    var openButton = documentRef.querySelector('[data-contents-open]');
    var closeButton = documentRef.querySelector('[data-contents-close]');
    var sheet = documentRef.querySelector('[data-contents-sheet]');

    function activate(mode) {
      page.setAttribute('data-active-mobile-panel', mode);
      modeButtons.forEach(function update(button) {
        setPressed(button, button.getAttribute('data-mobile-mode') === mode);
      });
    }

    modeButtons.forEach(function bindMode(button) {
      button.addEventListener('click', function switchMode() {
        activate(button.getAttribute('data-mobile-mode'));
      });
    });
    activate('code');

    function setSheet(open) {
      if (!sheet) return;
      sheet.hidden = !open;
      if (openButton) openButton.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open && closeButton) closeButton.focus();
    }

    if (openButton) openButton.addEventListener('click', function openSheet() { setSheet(true); });
    if (closeButton) closeButton.addEventListener('click', function closeSheet() { setSheet(false); });
    if (openButton) openButton.setAttribute('aria-expanded', 'false');
  }

  function initDetails(documentRef, storage) {
    var sourcePath = (documentRef.querySelector('[data-file-page]') || {}).dataset;
    var prefix = 'details:' + ((sourcePath && sourcePath.sourcePath) || 'page') + ':';
    Array.from(documentRef.querySelectorAll('details')).forEach(function bind(details, index) {
      var key = prefix + index;
      details.open = storage.get(key) === 'open';
      details.addEventListener('toggle', function remember() {
        storage.set(key, details.open ? 'open' : 'closed');
      });
    });
  }

  function initCopy(documentRef, notice) {
    var button = documentRef.querySelector('[data-copy-source]');
    var source = documentRef.querySelector('[data-source-code]');
    if (!button || !source) return;
    button.addEventListener('click', async function copy() {
      try {
        await copySourceText(source.textContent, documentRef);
        notice('원본 코드를 그대로 복사했습니다.');
      } catch (_) {
        notice('복사할 수 없습니다. 코드를 직접 선택해 주세요.');
      }
    });
  }

  function initDiagram(documentRef) {
    var viewport = documentRef.querySelector('[data-diagram-viewport]');
    if (!viewport) return;
    var layer = viewport.querySelector('[data-diagram-layer]');
    if (!layer) return;
    var transform = clampTransform({ x: 0, y: 0, scale: 1 });
    var drag = null;

    function render() {
      transform = clampTransform(transform);
      layer.style.transform = 'translate(' + transform.x + 'px, ' + transform.y + 'px) scale(' + transform.scale + ')';
      layer.style.transformOrigin = '0 0';
    }

    Array.from(documentRef.querySelectorAll('[data-diagram-zoom]')).forEach(function bindZoom(button) {
      button.addEventListener('click', function zoom() {
        transform.scale += button.getAttribute('data-diagram-zoom') === 'in' ? 0.15 : -0.15;
        render();
      });
    });
    var reset = documentRef.querySelector('[data-diagram-reset]');
    if (reset) reset.addEventListener('click', function resetDiagram() {
      transform = { x: 0, y: 0, scale: 1 };
      render();
    });

    viewport.addEventListener('keydown', function panWithKeyboard(event) {
      var delta = event.shiftKey ? 80 : 32;
      if (event.key === 'ArrowLeft') transform.x -= delta;
      else if (event.key === 'ArrowRight') transform.x += delta;
      else if (event.key === 'ArrowUp') transform.y -= delta;
      else if (event.key === 'ArrowDown') transform.y += delta;
      else return;
      event.preventDefault();
      render();
    });
    viewport.addEventListener('pointerdown', function startDrag(event) {
      drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      if (viewport.setPointerCapture) viewport.setPointerCapture(event.pointerId);
    });
    viewport.addEventListener('pointermove', function moveDrag(event) {
      if (!drag || drag.pointerId !== event.pointerId) return;
      transform.x += event.clientX - drag.x;
      transform.y += event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      render();
    });
    function endDrag(event) {
      if (drag && drag.pointerId === event.pointerId) drag = null;
    }
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
    render();
  }

  function init(documentRef, data) {
    if (!documentRef || typeof documentRef.querySelector !== 'function') return null;
    var storageCandidate;
    try {
      storageCandidate = global.localStorage;
    } catch (_) {
      storageCandidate = null;
    }
    var storage = createStorageAdapter(storageCandidate);
    var noticeRegion = documentRef.querySelector('[data-runtime-notice]');
    var fallbackAnnounced = false;

    function notice(message) {
      if (!noticeRegion) return;
      noticeRegion.textContent = message || '';
      noticeRegion.hidden = !message;
    }

    if (!storage.persistent && !fallbackAnnounced) {
      notice('이 브라우저에서는 학습 상태를 메모리에만 보관합니다.');
      fallbackAnnounced = true;
    } else if (noticeRegion) {
      noticeRegion.hidden = true;
    }

    var readPaths = new Set(readJsonArray(storage, 'read'));
    initTheme(documentRef, storage);
    initSearch(documentRef, data || {}, readPaths);
    initReadState(documentRef, storage, readPaths);
    initFileTabs(documentRef, storage);
    initMobileControls(documentRef);
    initDetails(documentRef, storage);
    initCopy(documentRef, notice);
    initDiagram(documentRef);

    return { storage: storage, readPaths: readPaths };
  }

  var runtime = Object.freeze({
    normalizeQuery: normalizeQuery,
    filterSearch: filterSearch,
    createStorageAdapter: createStorageAdapter,
    copySourceText: copySourceText,
    clampTransform: clampTransform,
    init: init,
  });

  global.DsmLearningRuntime = runtime;
  if (global.document) {
    var start = function start() {
      try {
        init(global.document, global.DSM_LEARNING_DATA || {});
      } catch (error) {
        var region = global.document.querySelector('[data-runtime-notice]');
        if (region) {
          region.hidden = false;
          region.textContent = '상호작용을 시작하지 못했습니다. 원본 코드와 링크는 그대로 이용할 수 있습니다.';
        }
        if (global.console && typeof global.console.error === 'function') {
          global.console.error(error);
        }
      }
    };
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }
  }
})(globalThis);
