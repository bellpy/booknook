'use strict';

/** Small SVG icons: leaves, books, stars, trees. Follows CSS `color` by default. */
function glyph(kind, { color = 'currentColor', size = 24, inner = 'var(--card)' } = {}) {
  const line = `style="fill:none;stroke:${color};stroke-width:2;stroke-linecap:round;stroke-linejoin:round"`;
  const solid = `style="fill:${color};stroke:${color};stroke-width:1;stroke-linejoin:round"`;
  let b = '';
  switch (kind) {
    case 'home':
      b = `<polyline points="-15,1 0,-13 15,1" ${line}/><polyline points="-11,-3 -11,12 11,12 11,-3" ${line}/>` +
          `<polyline points="-3,12 -3,5 3,5 3,12" ${line}/>`;
      break;
    case 'library':
    case 'book':
      b = `<polygon points="-16,-9 0,-5 0,11 -16,7" ${line}/><polygon points="16,-9 0,-5 0,11 16,7" ${line}/>`;
      break;
    case 'stats':
      b = `<polyline points="-15,-12 -15,12 15,12" ${line}/><polyline points="-9,5 -3,-2 3,3 12,-9" ${line}/>`;
      break;
    case 'shelf':
      b = `<rect x="-15" y="-8" width="7" height="18" ${line}/><rect x="-6" y="-13" width="7" height="23" ${line}/>` +
          `<polygon points="4,10 10,-9 17,-7 11,10" ${line}/><line x1="-18" y1="13" x2="19" y2="13" ${line}/>`;
      break;
    case 'add':
      b = `<circle cx="0" cy="0" r="14" ${line}/><line x1="-7" y1="0" x2="7" y2="0" ${line}/><line x1="0" y1="-7" x2="0" y2="7" ${line}/>`;
      break;
    case 'calendar':
      b = `<rect x="-13" y="-11" width="26" height="24" ${line}/><line x1="-13" y1="-4" x2="13" y2="-4" ${line}/>` +
          `<line x1="-6" y1="-15" x2="-6" y2="-8" ${line}/><line x1="6" y1="-15" x2="6" y2="-8" ${line}/>`;
      break;
    case 'heart':
      b = `<path d="M0 12 C-16 1 -14 -12 -6 -12 C-3 -12 -1 -10 0 -7 C1 -10 3 -12 6 -12 C14 -12 16 1 0 12Z" ${solid}/>`;
      break;
    case 'leaf':
      b = `<path d="M-11 9 C-12 -2 -4 -11 11 -11 C11 3 3 9 -11 9Z" ${solid}/>` +
          `<line x1="-9" y1="9" x2="5" y2="-5" style="stroke:${inner};stroke-width:2;stroke-linecap:round"/>`;
      break;
    case 'star': {
      const pts = [];
      for (let k = 0; k < 10; k++) {
        const r = k % 2 === 0 ? 13 : 5.5;
        const a = ((-90 + k * 36) * Math.PI) / 180;
        pts.push(`${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`);
      }
      b = `<polygon points="${pts.join(' ')}" ${solid}/>`;
      break;
    }
    case 'tree':
      b = `<polygon points="0,-14 -9,-3 9,-3" ${solid}/><polygon points="0,-9 -11,4 11,4" ${solid}/>` +
          `<rect x="-2" y="4" width="4" height="8" ${solid}/>`;
      break;
    case 'pages':
      b = `<rect x="-9" y="-13" width="18" height="26" ${line}/><line x1="-5" y1="-6" x2="5" y2="-6" ${line}/>` +
          `<line x1="-5" y1="-1" x2="5" y2="-1" ${line}/><line x1="-5" y1="4" x2="2" y2="4" ${line}/>`;
      break;
    case 'headphones':
      b = `<path d="M-12 -1 A12 12 0 0 1 12 -1" ${line}/><rect x="-14" y="0" width="6" height="10" ${solid}/>` +
          `<rect x="8" y="0" width="6" height="10" ${solid}/>`;
      break;
    default:
      break;
  }
  return `<svg class="glyph" width="${size}" height="${size}" viewBox="-20 -20 40 40" aria-hidden="true">${b}</svg>`;
}

/** The green badge with an open book that sits next to the title. */
function logoSvg() {
  return `<svg width="66" height="66" viewBox="0 0 66 66" aria-hidden="true">
    <rect x="4" y="8" width="59" height="55" rx="22" fill="#7E5A33"/>
    <rect x="3" y="3" width="58" height="54" rx="22" fill="#3F5D3C" stroke="#3F5D3C" stroke-width="2"/>
    <g transform="translate(32 31) scale(1.35)">${glyph('library', { color: '#F8F2E1', size: 0 }).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>
    <g transform="translate(52 9) scale(0.7)">${glyph('leaf', { color: '#8FAA6E', inner: '#3F5D3C', size: 0 }).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</g>
  </svg>`;
}
