/*
 * Copyright 2026 Dwipal Shrirao
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

// Shared by content scripts and the popup: export model, Markdown/JSON
// renderers, and filename helpers.

function createExportModel(platform, title, url) {
  return {
    platform,
    title: title || 'Untitled conversation',
    url: url || '',
    exportedAt: new Date().toISOString(),
    messages: [],
  };
}

function addMessage(model, role, blocks, timestamp) {
  model.messages.push({ role, timestamp: timestamp || '', blocks: blocks || [] });
}

function tableToMarkdown(block) {
  if (!block.rows || !block.rows.length) return '';
  const header = block.rows[0];
  const lines = [
    '| ' + header.join(' | ') + ' |',
    '| ' + header.map(() => '---').join(' | ') + ' |',
  ];
  for (const row of block.rows.slice(1)) {
    lines.push('| ' + row.join(' | ') + ' |');
  }
  return lines.join('\n');
}

function blocksToMarkdown(blocks) {
  return (blocks || [])
    .map((b) => {
      if (b.type === 'code') {
        return '```' + (b.language || '') + '\n' + b.content + '\n```';
      }
      if (b.type === 'table') return tableToMarkdown(b);
      return b.content || '';
    })
    .join('\n\n');
}

function buildMarkdown(model) {
  const header = [
    '# ' + model.title,
    '',
    '_Exported from ' + model.platform + ' on ' + model.exportedAt + '_',
    '',
    'Source: ' + model.url,
  ].join('\n');

  const parts = [header];
  for (const msg of model.messages) {
    const label = msg.role === 'user' ? 'User' : 'Assistant';
    const head = '## ' + label + (msg.timestamp ? ' · ' + msg.timestamp : '');
    const body = blocksToMarkdown(msg.blocks);
    parts.push([head, body].join('\n\n'));
  }
  return parts.join('\n\n---\n\n') + '\n';
}

function buildJson(model) {
  return JSON.stringify(model, null, 2);
}

function sanitizeFilename(name) {
  return (
    String(name)
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'conversation'
  );
}
