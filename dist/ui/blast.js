// Blast radius figure shared by the stratagem and gear detail sheets.
import { num } from '../core/explain.js';
import { html } from './dom.js';

export function blastFigure(item) {
  if (item.radius == null || item.innerRadius == null) return '';
  const outer = 56, inner = Math.max(8, outer * item.innerRadius / item.radius);
  return html`<div class="blast">
    <svg width="176" height="176" viewBox="0 0 132 132" role="img" aria-label="폭발 반경: 중심 ${item.innerRadius}m, 외곽 ${item.radius}m">
      <circle cx="66" cy="66" r="${outer}" fill="var(--accent-soft)" stroke="var(--accent)" stroke-opacity=".45" stroke-dasharray="3 4"/>
      <circle cx="66" cy="66" r="${inner}" fill="var(--accent)" fill-opacity=".35" stroke="var(--accent)"/>
      <path d="M66 66H${66 - outer}M66 66H${66 + inner}" stroke="var(--text)" stroke-width="1.2"/>
      <circle cx="66" cy="66" r="2.5" fill="var(--text)"/>
      <g class="blast-label" aria-hidden="true">
        <text x="62" y="59" text-anchor="end">외곽 ${num(item.radius)}m</text>
        <text x="70" y="80">중심 ${num(item.innerRadius)}m</text>
      </g>
    </svg>
    <p><b style="color:var(--text)">중심 ${num(item.innerRadius)}m</b> 안쪽은 최대 피해입니다.<br>바깥으로 갈수록 줄어들어 <b style="color:var(--text)">${num(item.radius)}m</b>에서 사라지고, 관통력도 1 낮아집니다(최소 2).<br><span class="faint">충격파·함선 강화 효과는 제외한 반경입니다.</span></p>
  </div>`;
}
