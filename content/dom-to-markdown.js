'use strict';

// Converts a rendered-markdown DOM subtree into an array of structured blocks:
//   { type: 'text',  content }            content is GitHub-flavored Markdown
//   { type: 'code',  language, content }
//   { type: 'table', rows: string[][] }   first row is the header
// These blocks are rendered to Markdown or JSON downstream.

function nodeText(el) {
  return el.innerText !== undefined ? el.innerText : el.textContent;
}

function escapeMdCell(text) {
  return text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

// Inline subtree -> markdown text (bold, italic, code, links, images, breaks).
function inlineToMd(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue;
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const tag = node.tagName.toLowerCase();
  switch (tag) {
    case 'br':
      return '\n';
    case 'strong':
    case 'b':
      return '**' + inlineChildren(node) + '**';
    case 'em':
    case 'i':
      return '*' + inlineChildren(node) + '*';
    case 'del':
    case 's':
      return '~~' + inlineChildren(node) + '~~';
    case 'code':
      return '`' + (node.textContent || '').replace(/`/g, '\\`') + '`';
    case 'a': {
      const href = node.getAttribute('href');
      const text = inlineChildren(node);
      if (href && !href.toLowerCase().startsWith('javascript:')) {
        return '[' + text + '](' + href + ')';
      }
      return text;
    }
    case 'img': {
      const alt = node.getAttribute('alt') || '';
      const src = node.getAttribute('src') || '';
      return src ? '![' + alt + '](' + src + ')' : '';
    }
    default:
      return inlineChildren(node);
  }
}

function inlineChildren(node) {
  return Array.from(node.childNodes)
    .map(inlineToMd)
    .join('');
}

function extractCodeBlock(preOrCode) {
  const codeEl =
    preOrCode.tagName && preOrCode.tagName.toLowerCase() === 'pre'
      ? preOrCode.querySelector('code') || preOrCode
      : preOrCode;
  let language = codeEl.getAttribute ? codeEl.getAttribute('data-language') || '' : '';
  const collectFromClass = (el) => {
    if (!language && el.classList) {
      for (const cls of el.classList) {
        if (cls.startsWith('language-')) {
          language = cls.replace('language-', '');
          break;
        }
      }
    }
  };
  collectFromClass(codeEl);
  const pre = codeEl.closest ? codeEl.closest('pre') : null;
  if (pre) collectFromClass(pre);
  if (!language && pre) {
    // Claude renders code groups with an aria-label like "python code".
    const group = pre.closest('[role="group"], [class*="code-group"], [class*="code-block"]');
    const label = group && group.getAttribute ? group.getAttribute('aria-label') : '';
    if (label) {
      const m = label.match(/([\w#+-]+)\s*(?:code|language)/i);
      if (m) language = m[1];
    }
  }
  if (!language && pre) {
    const label = pre.querySelector('header, [class*="lang"]');
    if (label && label.textContent.trim().length < 30) {
      language = label.textContent.trim();
    }
  }
  return { type: 'code', language, content: nodeText(codeEl).replace(/\n$/, '') };
}

function tableToBlock(table) {
  const rows = [];
  for (const tr of table.querySelectorAll('tr')) {
    const cells = Array.from(tr.querySelectorAll('th, td')).map((c) =>
      escapeMdCell(nodeText(c).trim())
    );
    if (cells.length) rows.push(cells);
  }
  return { type: 'table', rows };
}

function listToMd(list) {
  const ordered = list.tagName.toLowerCase() === 'ol';
  let out = '';
  const walk = (listEl, prefix) => {
    let counter = 0;
    for (const li of listEl.children) {
      if (li.tagName.toLowerCase() !== 'li') continue;
      counter += 1;
      const marker = ordered ? prefix + counter + '. ' : prefix + '- ';
      const inlineParts = Array.from(li.childNodes).filter(
        (n) => !(n.nodeType === Node.ELEMENT_NODE && (n.tagName === 'UL' || n.tagName === 'OL'))
      );
      const text = inlineParts.map(inlineToMd).join('').trim();
      if (text) out += marker + text + '\n';
      for (const nested of li.querySelectorAll(':scope > ul, :scope > ol')) {
        walk(nested, prefix + '  ');
      }
    }
  };
  walk(list, '');
  return out.replace(/\n+$/, '');
}

function blockquoteToMd(bq) {
  return nodeText(bq)
    .trim()
    .split('\n')
    .map((l) => '> ' + l)
    .join('\n');
}

// Convert the children of `root` into structured blocks, splitting text
// runs from code blocks, tables, lists, and blockquotes.
function elementToBlocks(root) {
  const blocks = [];
  let textBuf = [];

  const flushText = () => {
    if (!textBuf.length) return;
    const content = textBuf.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
    if (content) blocks.push({ type: 'text', content });
    textBuf = [];
  };
  const appendText = (md) => {
    if (md && md.trim()) textBuf.push(md.trim());
  };

  const processNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      appendText(node.nodeValue);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'pre') {
      flushText();
      blocks.push(extractCodeBlock(node));
      return;
    }
    if (tag === 'table') {
      flushText();
      blocks.push(tableToBlock(node));
      return;
    }
    if (tag === 'ul' || tag === 'ol') {
      flushText();
      const md = listToMd(node);
      if (md.trim()) blocks.push({ type: 'text', content: md });
      return;
    }
    if (tag === 'blockquote') {
      flushText();
      const md = blockquoteToMd(node);
      if (md.trim()) blocks.push({ type: 'text', content: md });
      return;
    }
    if (/^h[1-6]$/.test(tag)) {
      flushText();
      const md = '#'.repeat(Number(tag[1])) + ' ' + inlineToMd(node).trim();
      if (md.trim()) blocks.push({ type: 'text', content: md });
      return;
    }
    if (tag === 'img') {
      appendText(inlineToMd(node));
      return;
    }
    if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article' || tag === 'span') {
      const pre = node.querySelector('pre');
      if (pre) {
        // If this container is essentially a code block (a <pre> plus little
        // meaningful text around it, e.g. a copy button or language label),
        // treat the whole thing as one code block instead of recursing.
        const clone = node.cloneNode(true);
        clone.querySelectorAll('pre').forEach((p) => p.remove());
        const outside = nodeText(clone).trim();
        if (outside.length <= 80) {
          flushText();
          blocks.push(extractCodeBlock(pre));
          return;
        }
      }
      const hasSpecial = node.querySelector('pre, table, ul, ol, blockquote, img');
      if (hasSpecial) {
        Array.from(node.childNodes).forEach(processNode);
      } else {
        appendText(inlineToMd(node));
      }
      return;
    }
    Array.from(node.childNodes).forEach(processNode);
  };

  Array.from(root.childNodes).forEach(processNode);
  flushText();
  return blocks;
}
