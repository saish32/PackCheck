"use client";

import { useState } from "react";
import { Icon } from "./Icons";

// Safe percentage calculation
function calcPercent(val, total) {
  if (!total || total <= 0 || !val) return 0;
  return Math.round((val / total) * 100);
}

/**
 * 1. PRIMARY OUTCOME DONUT
 * Shows distribution of authoritative compliance findings:
 * SATISFIED, POTENTIAL_NON_COMPLIANCE, REVIEW_REQUIRED
 */
export function OutcomeDonutChart({ data }) {
  const [showTable, setShowTable] = useState(false);

  const satisfied = data?.satisfied || 0;
  const potentialNc = data?.potential_non_compliance || 0;
  const reviewRequired = data?.review_required || 0;
  const total = data?.total_findings || (satisfied + potentialNc + reviewRequired);

  if (total === 0) {
    return (
      <div className="analytics-card outcome-donut-card">
        <div className="analytics-card-header">
          <div>
            <h3 className="analytics-card-title">Compliance Findings Outcome</h3>
            <span className="analytics-card-sub">Distribution of authoritative compliance findings</span>
          </div>
        </div>
        <div className="chart-empty-state">
          <Icon name="check" size={24} className="empty-icon" />
          <p>No compliance findings recorded for the selected period.</p>
        </div>
      </div>
    );
  }

  // SVG Donut calculation
  const radius = 68;
  const circumference = 2 * Math.PI * radius;

  const satPct = total > 0 ? satisfied / total : 0;
  const ncPct = total > 0 ? potentialNc / total : 0;
  const revPct = total > 0 ? reviewRequired / total : 0;

  const satStroke = satPct * circumference;
  const ncStroke = ncPct * circumference;
  const revStroke = revPct * circumference;

  // Offsets
  const satOffset = 0;
  const ncOffset = -satStroke;
  const revOffset = -(satStroke + ncStroke);

  return (
    <div className="analytics-card outcome-donut-card">
      <div className="analytics-card-header">
        <div>
          <h3 className="analytics-card-title">Compliance Findings Outcome</h3>
          <span className="analytics-card-sub">Distribution across authoritative compliance findings</span>
        </div>
        <button
          type="button"
          className="btn-toggle-table"
          onClick={() => setShowTable(!showTable)}
          aria-expanded={showTable}
        >
          {showTable ? "View Chart" : "View Data Table"}
        </button>
      </div>

      {!showTable ? (
        <div className="donut-layout-row">
          <div className="donut-svg-wrapper">
            <svg
              className="donut-svg"
              viewBox="0 0 180 180"
              width="180"
              height="180"
              role="img"
              aria-label={`Outcome distribution: ${satisfied} satisfied (${calcPercent(satisfied, total)}%), ${potentialNc} potential non-compliance (${calcPercent(potentialNc, total)}%), ${reviewRequired} review required (${calcPercent(reviewRequired, total)}%)`}
            >
              <circle
                className="donut-ring-track"
                cx="90"
                cy="90"
                r={radius}
                fill="none"
                strokeWidth="20"
              />
              {/* Satisfied segment */}
              {satisfied > 0 && (
                <circle
                  className="donut-segment segment-satisfied"
                  cx="90"
                  cy="90"
                  r={radius}
                  fill="none"
                  strokeWidth="20"
                  strokeDasharray={`${satStroke} ${circumference - satStroke}`}
                  strokeDashoffset={satOffset}
                  transform="rotate(-90 90 90)"
                />
              )}
              {/* Potential Non-Compliance segment */}
              {potentialNc > 0 && (
                <circle
                  className="donut-segment segment-potential-nc"
                  cx="90"
                  cy="90"
                  r={radius}
                  fill="none"
                  strokeWidth="20"
                  strokeDasharray={`${ncStroke} ${circumference - ncStroke}`}
                  strokeDashoffset={ncOffset}
                  transform="rotate(-90 90 90)"
                />
              )}
              {/* Review Required segment */}
              {reviewRequired > 0 && (
                <circle
                  className="donut-segment segment-review-req"
                  cx="90"
                  cy="90"
                  r={radius}
                  fill="none"
                  strokeWidth="20"
                  strokeDasharray={`${revStroke} ${circumference - revStroke}`}
                  strokeDashoffset={revOffset}
                  transform="rotate(-90 90 90)"
                />
              )}
              <text x="90" y="85" textAnchor="middle" className="donut-center-num">
                {total}
              </text>
              <text x="90" y="103" textAnchor="middle" className="donut-center-label">
                TOTAL FINDINGS
              </text>
            </svg>
          </div>

          <div className="donut-legend-col">
            <div className="legend-row">
              <span className="legend-dot dot-satisfied" aria-hidden="true" />
              <div className="legend-text-block">
                <span className="legend-label">Satisfied</span>
                <span className="legend-note">Authoritative statutory checks met</span>
              </div>
              <div className="legend-metrics">
                <span className="legend-count">{satisfied}</span>
                <span className="legend-pct">{calcPercent(satisfied, total)}%</span>
              </div>
            </div>

            <div className="legend-row">
              <span className="legend-dot dot-potential-nc" aria-hidden="true" />
              <div className="legend-text-block">
                <span className="legend-label">Potential Non-Compliance</span>
                <span className="legend-note">Flagged rule discrepancies</span>
              </div>
              <div className="legend-metrics">
                <span className="legend-count">{potentialNc}</span>
                <span className="legend-pct">{calcPercent(potentialNc, total)}%</span>
              </div>
            </div>

            <div className="legend-row">
              <span className="legend-dot dot-review-req" aria-hidden="true" />
              <div className="legend-text-block">
                <span className="legend-label">Review Required</span>
                <span className="legend-note">Awaiting supervisor confirmation</span>
              </div>
              <div className="legend-metrics">
                <span className="legend-count">{reviewRequired}</span>
                <span className="legend-pct">{calcPercent(reviewRequired, total)}%</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="accessible-table-wrap">
          <table className="accessible-data-table">
            <thead>
              <tr>
                <th scope="col">Compliance Outcome</th>
                <th scope="col" style={{ textAlign: "right" }}>Findings Count</th>
                <th scope="col" style={{ textAlign: "right" }}>Outcome Share</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Satisfied</td>
                <td style={{ textAlign: "right" }} className="font-mono">{satisfied}</td>
                <td style={{ textAlign: "right" }}>{calcPercent(satisfied, total)}%</td>
              </tr>
              <tr>
                <td>Potential Non-Compliance</td>
                <td style={{ textAlign: "right" }} className="font-mono">{potentialNc}</td>
                <td style={{ textAlign: "right" }}>{calcPercent(potentialNc, total)}%</td>
              </tr>
              <tr>
                <td>Review Required</td>
                <td style={{ textAlign: "right" }} className="font-mono">{reviewRequired}</td>
                <td style={{ textAlign: "right" }}>{calcPercent(reviewRequired, total)}%</td>
              </tr>
              <tr className="table-row-total">
                <td>Total Findings Evaluated</td>
                <td style={{ textAlign: "right" }} className="font-mono">{total}</td>
                <td style={{ textAlign: "right" }}>100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * 2. INSPECTOR INSPECTION WORKLOAD
 * Horizontal bar chart showing inspection counts associated with each inspector.
 * (API semantics: inspections, not check/finding counts)
 */
export function InspectorWorkloadBarChart({ items = [] }) {
  const sorted = [...items].sort((a, b) => (b.inspection_count || 0) - (a.inspection_count || 0));
  const maxVal = Math.max(...sorted.map((i) => i.inspection_count || 0), 1);

  if (sorted.length === 0) {
    return (
      <div className="analytics-card inspector-workload-card">
        <div className="analytics-card-header">
          <div>
            <h3 className="analytics-card-title">Inspector Inspection Workload</h3>
            <span className="analytics-card-sub">Inspections by inspector</span>
          </div>
        </div>
        <div className="chart-empty-state">
          <Icon name="overview" size={24} className="empty-icon" />
          <p>No inspector workload recorded for the selected period.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-card inspector-workload-card">
      <div className="analytics-card-header">
        <div>
          <h3 className="analytics-card-title">Inspector Inspection Workload</h3>
          <span className="analytics-card-sub">Inspections by inspector</span>
        </div>
        <span className="badge-counter">{sorted.length} Inspectors</span>
      </div>

      <div className="bar-list-container" role="list" aria-label="Inspector workload by inspection count">
        {sorted.map((ins, idx) => {
          const count = ins.inspection_count || 0;
          const widthPct = Math.min(100, Math.max(8, Math.round((count / maxVal) * 100)));
          return (
            <div key={ins.inspector_id || idx} className="bar-row-item" role="listitem">
              <div className="bar-label-line">
                <span className="bar-item-name font-medium" title={ins.inspector_name}>
                  {ins.inspector_name}
                </span>
                <span className="bar-item-val font-mono">{count} {count === 1 ? "inspection" : "inspections"}</span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill bar-fill-primary"
                  style={{ width: `${widthPct}%` }}
                  aria-hidden="true"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 3. CATEGORY COMPLIANCE OUTCOMES
 * Shows breakdown of finding outcomes across product categories.
 */
export function CategoryOutcomeVisual({ items = [] }) {
  const [showTable, setShowTable] = useState(false);

  if (!items || items.length === 0) {
    return (
      <div className="analytics-card category-outcome-card">
        <div className="analytics-card-header">
          <div>
            <h3 className="analytics-card-title">Compliance Outcomes by Category</h3>
            <span className="analytics-card-sub">Finding outcomes and inspection volume per category</span>
          </div>
        </div>
        <div className="chart-empty-state">
          <Icon name="declarations" size={24} className="empty-icon" />
          <p>No category data recorded for the selected period.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-card category-outcome-card">
      <div className="analytics-card-header">
        <div>
          <h3 className="analytics-card-title">Compliance Outcomes by Category</h3>
          <span className="analytics-card-sub">Finding outcomes and inspection volume per category</span>
        </div>
        <button
          type="button"
          className="btn-toggle-table"
          onClick={() => setShowTable(!showTable)}
          aria-expanded={showTable}
        >
          {showTable ? "View Chart" : "View Data Table"}
        </button>
      </div>

      {!showTable ? (
        <div className="category-bars-list">
          {items.slice(0, 6).map((cat, idx) => {
            const sat = cat.satisfied_count || 0;
            const nc = cat.potential_non_compliance_count || 0;
            const rev = cat.review_required_count || 0;
            const totalFindings = sat + nc + rev;

            const satPct = totalFindings > 0 ? (sat / totalFindings) * 100 : 0;
            const ncPct = totalFindings > 0 ? (nc / totalFindings) * 100 : 0;
            const revPct = totalFindings > 0 ? (rev / totalFindings) * 100 : 0;

            return (
              <div key={cat.category || idx} className="category-bar-item">
                <div className="category-meta-line">
                  <div className="category-name-block">
                    <span className="category-name">{cat.category || "Unspecified"}</span>
                    <span className="category-ins-badge font-mono">
                      {cat.total_inspections} {cat.total_inspections === 1 ? "inspection" : "inspections"}
                    </span>
                  </div>
                  <div className="category-findings-legend">
                    <span className="legend-chip chip-sat font-mono" title="Satisfied">{sat} sat</span>
                    <span className="legend-chip chip-nc font-mono" title="Potential Non-Compliance">{nc} NC</span>
                    <span className="legend-chip chip-rev font-mono" title="Review Required">{rev} rev</span>
                  </div>
                </div>

                <div className="stacked-meter-track" title={`${cat.category}: ${sat} satisfied, ${nc} potential NC, ${rev} review required`}>
                  {satPct > 0 && (
                    <div
                      className="meter-slice slice-satisfied"
                      style={{ width: `${satPct}%` }}
                    />
                  )}
                  {ncPct > 0 && (
                    <div
                      className="meter-slice slice-potential-nc"
                      style={{ width: `${ncPct}%` }}
                    />
                  )}
                  {revPct > 0 && (
                    <div
                      className="meter-slice slice-review-req"
                      style={{ width: `${revPct}%` }}
                    />
                  )}
                </div>
              </div>
            );
          })}
          {items.length > 6 && (
            <div className="table-more-hint">
              <span>Showing top 6 categories. Toggle table for complete list ({items.length} total).</span>
            </div>
          )}
        </div>
      ) : (
        <div className="accessible-table-wrap">
          <table className="accessible-data-table">
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col" style={{ textAlign: "right" }}>Inspections</th>
                <th scope="col" style={{ textAlign: "right" }}>Satisfied</th>
                <th scope="col" style={{ textAlign: "right" }}>Potential NC</th>
                <th scope="col" style={{ textAlign: "right" }}>Review Req</th>
              </tr>
            </thead>
            <tbody>
              {items.map((cat, idx) => (
                <tr key={cat.category || idx}>
                  <td className="font-medium">{cat.category || "Unspecified"}</td>
                  <td style={{ textAlign: "right" }} className="font-mono">{cat.total_inspections}</td>
                  <td style={{ textAlign: "right" }} className="font-mono color-success">{cat.satisfied_count}</td>
                  <td style={{ textAlign: "right" }} className="font-mono color-danger">{cat.potential_non_compliance_count}</td>
                  <td style={{ textAlign: "right" }} className="font-mono color-warning">{cat.review_required_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/**
 * 4. COMMON POTENTIAL NON-COMPLIANCE RULES
 * Ranked horizontal bar chart showing rules with highest potential non-compliance counts.
 */
export function CommonFailuresBarChart({ items = [] }) {
  const sorted = [...items].sort((a, b) => (b.count || 0) - (a.count || 0));
  const maxVal = Math.max(...sorted.map((i) => i.count || 0), 1);

  if (sorted.length === 0) {
    return (
      <div className="analytics-card common-failures-card">
        <div className="analytics-card-header">
          <div>
            <h3 className="analytics-card-title">Most Frequent Potential Non-Compliance Rules</h3>
            <span className="analytics-card-sub">Selected-period regulatory discrepancy distribution</span>
          </div>
        </div>
        <div className="chart-empty-state">
          <Icon name="check" size={24} className="empty-icon" />
          <p>No rule non-compliance findings recorded for the selected period.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-card common-failures-card">
      <div className="analytics-card-header">
        <div>
          <h3 className="analytics-card-title">Most Frequent Potential Non-Compliance Rules</h3>
          <span className="analytics-card-sub">Selected-period regulatory discrepancy distribution</span>
        </div>
        <span className="badge-counter badge-danger-soft">{sorted.length} Rules Flagged</span>
      </div>

      <div className="bar-list-container" role="list" aria-label="Most frequent potential non-compliance rules">
        {sorted.slice(0, 6).map((item, idx) => {
          const count = item.count || 0;
          const widthPct = Math.min(100, Math.max(8, Math.round((count / maxVal) * 100)));
          return (
            <div key={item.requirement_key || idx} className="bar-row-item" role="listitem">
              <div className="bar-label-line">
                <div className="rule-title-group">
                  <span className="rule-badge-pill">Rule {item.rule_no || "—"}</span>
                  <span className="rule-title-text" title={item.title}>
                    {item.title || item.requirement_key}
                  </span>
                </div>
                <span className="bar-item-val font-mono color-danger">{count} {count === 1 ? "finding" : "findings"}</span>
              </div>
              <div className="bar-track">
                <div
                  className="bar-fill bar-fill-danger"
                  style={{ width: `${widthPct}%` }}
                  aria-hidden="true"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 5. INSPECTION CHANNEL DISTRIBUTION
 * Compact donut chart showing breakdown by Physical vs E-Commerce vs Unknown channels.
 */
export function ChannelDistributionDonut({ data }) {
  const physical = data?.physical || 0;
  const eCommerce = data?.e_commerce || 0;
  const unknown = data?.unknown || 0;
  const total = physical + eCommerce + unknown;

  if (total === 0) {
    return (
      <div className="analytics-card channel-donut-card">
        <div className="analytics-card-header">
          <div>
            <h3 className="analytics-card-title">Inspection Channel Distribution</h3>
            <span className="analytics-card-sub">Physical retail vs. E-Commerce inspection sources</span>
          </div>
        </div>
        <div className="chart-empty-state">
          <Icon name="inspections" size={20} className="empty-icon" />
          <p>No channel distribution data recorded.</p>
        </div>
      </div>
    );
  }

  const radius = 48;
  const circumference = 2 * Math.PI * radius;

  const physPct = physical / total;
  const ecomPct = eCommerce / total;
  const unkPct = unknown / total;

  const physStroke = physPct * circumference;
  const ecomStroke = ecomPct * circumference;
  const unkStroke = unkPct * circumference;

  const physOffset = 0;
  const ecomOffset = -physStroke;
  const unkOffset = -(physStroke + ecomStroke);

  return (
    <div className="analytics-card channel-donut-card">
      <div className="analytics-card-header">
        <div>
          <h3 className="analytics-card-title">Inspection Channel Distribution</h3>
          <span className="analytics-card-sub">Physical retail vs. E-Commerce inspection sources</span>
        </div>
      </div>

      <div className="compact-donut-layout">
        <div className="donut-svg-wrapper-sm">
          <svg
            className="donut-svg-sm"
            viewBox="0 0 130 130"
            width="130"
            height="130"
            role="img"
            aria-label={`Channels: ${physical} physical (${calcPercent(physical, total)}%), ${eCommerce} e-commerce (${calcPercent(eCommerce, total)}%), ${unknown} unknown (${calcPercent(unknown, total)}%)`}
          >
            <circle
              className="donut-ring-track"
              cx="65"
              cy="65"
              r={radius}
              fill="none"
              strokeWidth="14"
            />
            {physical > 0 && (
              <circle
                className="donut-segment segment-physical"
                cx="65"
                cy="65"
                r={radius}
                fill="none"
                strokeWidth="14"
                strokeDasharray={`${physStroke} ${circumference - physStroke}`}
                strokeDashoffset={physOffset}
                transform="rotate(-90 65 65)"
              />
            )}
            {eCommerce > 0 && (
              <circle
                className="donut-segment segment-ecommerce"
                cx="65"
                cy="65"
                r={radius}
                fill="none"
                strokeWidth="14"
                strokeDasharray={`${ecomStroke} ${circumference - ecomStroke}`}
                strokeDashoffset={ecomOffset}
                transform="rotate(-90 65 65)"
              />
            )}
            {unknown > 0 && (
              <circle
                className="donut-segment segment-unknown"
                cx="65"
                cy="65"
                r={radius}
                fill="none"
                strokeWidth="14"
                strokeDasharray={`${unkStroke} ${circumference - unkStroke}`}
                strokeDashoffset={unkOffset}
                transform="rotate(-90 65 65)"
              />
            )}
            <text x="65" y="62" textAnchor="middle" className="donut-center-num-sm">
              {total}
            </text>
            <text x="65" y="76" textAnchor="middle" className="donut-center-label-sm">
              CHANNELS
            </text>
          </svg>
        </div>

        <div className="compact-legend-col">
          <div className="compact-legend-row">
            <span className="legend-dot dot-physical" aria-hidden="true" />
            <span className="legend-label">Physical Retail</span>
            <span className="font-mono legend-count-val">{physical} ({calcPercent(physical, total)}%)</span>
          </div>
          <div className="compact-legend-row">
            <span className="legend-dot dot-ecommerce" aria-hidden="true" />
            <span className="legend-label">E-Commerce Marketplace</span>
            <span className="font-mono legend-count-val">{eCommerce} ({calcPercent(eCommerce, total)}%)</span>
          </div>
          {unknown > 0 && (
            <div className="compact-legend-row">
              <span className="legend-dot dot-unknown" aria-hidden="true" />
              <span className="legend-label">Unspecified / Unknown</span>
              <span className="font-mono legend-count-val">{unknown} ({calcPercent(unknown, total)}%)</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 6. REVIEW QUEUE
 * Operational supervisor review workload and pending queues.
 * (Operational queue, NOT a comparative ranking)
 */
export function ReviewerWorkloadQueue({ items = [] }) {
  if (!items || items.length === 0) {
    return (
      <div className="analytics-card reviewer-queue-card">
        <div className="analytics-card-header">
          <div>
            <h3 className="analytics-card-title">Review Queue</h3>
            <span className="analytics-card-sub">Pending supervisory review and assignment queue</span>
          </div>
        </div>
        <div className="chart-empty-state">
          <Icon name="check" size={20} className="empty-icon" />
          <p>No pending review workload for the selected period.</p>
        </div>
      </div>
    );
  }

  const totalPending = items.reduce((acc, curr) => acc + (curr.pending_count || 0), 0);

  return (
    <div className="analytics-card reviewer-queue-card">
      <div className="analytics-card-header">
        <div>
          <h3 className="analytics-card-title">Review Queue</h3>
          <span className="analytics-card-sub">Pending supervisory review and assignment queue</span>
        </div>
        <span className="badge-counter badge-amber-soft font-mono">
          {totalPending} {totalPending === 1 ? "Pending Record" : "Pending Records"}
        </span>
      </div>

      <div className="queue-list" role="list" aria-label="Reviewers with pending inspection assignments">
        {items.map((rev, idx) => {
          const isAwaiting = !rev.reviewer_id || rev.reviewer_name?.toLowerCase().includes("awaiting");
          const count = rev.pending_count || 0;
          return (
            <div
              key={rev.reviewer_id || idx}
              className={`queue-row-item ${isAwaiting ? "item-unassigned" : ""}`}
              role="listitem"
            >
              <div className="queue-identity">
                <div className={`queue-avatar ${isAwaiting ? "avatar-unassigned" : ""}`} aria-hidden="true">
                  {isAwaiting ? "!" : (rev.reviewer_name?.charAt(0) || "S").toUpperCase()}
                </div>
                <div className="queue-meta">
                  <span className="queue-name font-medium">{rev.reviewer_name}</span>
                  <span className="queue-sub">
                    {isAwaiting ? "Awaiting supervisor assignment" : "Assigned compliance reviewer"}
                  </span>
                </div>
              </div>
              <div className="queue-count-badge font-mono">
                <span className="count-num">{count}</span>
                <span className="count-label">pending</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
