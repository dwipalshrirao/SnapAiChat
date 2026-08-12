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

// Clipboard helper used by the popup. Prefers the async clipboard API and
// falls back to a hidden <textarea> + execCommand, which needs no extra
// permission and works inside a user gesture.

function copyText(text) {
  return new Promise((resolve) => {
    let used = false;
    const fallback = () => {
      if (used) return true;
      used = true;
      return copyTextFallback(text);
    };
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(
          () => {
            used = true;
            resolve(true);
          },
          () => resolve(fallback())
        );
        return;
      }
    } catch (e) {
      /* fall through */
    }
    resolve(fallback());
  });
}

function copyTextFallback(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.top = '-10000px';
  ta.style.left = '-10000px';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch (e) {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}