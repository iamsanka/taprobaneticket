"use client";

import { useEffect, useState } from "react";
import "./Settings.css";

type Settings = {
  id: number;
  vatRatePercent: string;
  whatsappNumber: string;
  whatsappDisplay: string;
  brandName: string;
  updatedAt: string;
};

type FormState = {
  vatRatePercent: string;
  whatsappNumber: string;
  whatsappDisplay: string;
  brandName: string;
};

type PaymentMethod = "card" | "epassi" | "edenred";

type PaymentCostMode = "percentage_plus_fixed" | "percentage_or_fixed";

type PaymentCostRow = {
  id: number;
  method: PaymentMethod;
  mode: PaymentCostMode;
  percentageBps: number;
  fixedAmount: number;
  isActive: boolean;
  updatedAt: string;
};

type PaymentCostForm = {
  mode: PaymentCostMode;
  percent: string;
  fixedEuro: string;
  isActive: boolean;
};

const METHOD_LABELS: Record<PaymentMethod, string> = {
  card: "Card / Stripe",
  epassi: "ePassi",
  edenred: "Edenred",
};

const ALL_METHODS: PaymentMethod[] = ["card", "epassi", "edenred"];

const DEFAULT_COST_FORMS: Record<PaymentMethod, PaymentCostForm> = {
  card: {
    mode: "percentage_plus_fixed",
    percent: "",
    fixedEuro: "",
    isActive: true,
  },
  epassi: {
    mode: "percentage_or_fixed",
    percent: "",
    fixedEuro: "",
    isActive: true,
  },
  edenred: {
    mode: "percentage_or_fixed",
    percent: "",
    fixedEuro: "",
    isActive: true,
  },
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<FormState>({
    vatRatePercent: "",
    whatsappNumber: "",
    whatsappDisplay: "",
    brandName: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // ---- Payment costs state ----
  const [costs, setCosts] = useState<PaymentCostRow[]>([]);
  const [costForms, setCostForms] = useState<
    Record<PaymentMethod, PaymentCostForm>
  >({ ...DEFAULT_COST_FORMS });
  const [costsLoading, setCostsLoading] = useState(true);
  const [costsSaving, setCostsSaving] = useState(false);
  const [costsError, setCostsError] = useState<string | null>(null);
  const [costsSaved, setCostsSaved] = useState(false);

  // ==================================================
  // Load both settings + payment costs on mount
  // ==================================================
  useEffect(() => {
    async function loadAll() {
      try {
        const [settingsRes, costsRes] = await Promise.all([
          fetch("/api/super-admin/settings", { credentials: "include" }),
          fetch("/api/super-admin/payment-costs", { credentials: "include" }),
        ]);

        if (settingsRes.ok) {
          const data = await settingsRes.json();
          const s: Settings = data.settings;
          setSettings(s);
          setForm({
            vatRatePercent: s.vatRatePercent,
            whatsappNumber: s.whatsappNumber,
            whatsappDisplay: s.whatsappDisplay,
            brandName: s.brandName,
          });
        } else {
          const body = await settingsRes.json().catch(() => null);
          setError(body?.error || "Failed to load settings");
        }

        if (costsRes.ok) {
          const data = await costsRes.json();
          const rows: PaymentCostRow[] = data.costs ?? [];
          setCosts(rows);

          const map: Record<PaymentMethod, PaymentCostForm> = {
            ...DEFAULT_COST_FORMS,
          };
          for (const row of rows) {
            map[row.method] = {
              mode: row.mode,
              percent: (row.percentageBps / 100).toString(),
              fixedEuro: (row.fixedAmount / 100).toString(),
              isActive: row.isActive,
            };
          }
          setCostForms(map);
        } else {
          const body = await costsRes.json().catch(() => null);
          setCostsError(body?.error || "Failed to load payment costs");
        }
      } catch (err) {
        console.error(err);
        setError("Network error");
      } finally {
        setLoading(false);
        setCostsLoading(false);
      }
    }

    loadAll();
  }, []);

  // ==================================================
  // Settings form handlers
  // ==================================================
  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    setSaving(true);
    try {
      const res = await fetch("/api/super-admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const body = await res.json();

      if (!res.ok) {
        setError(body.error || "Failed to save settings");
        return;
      }

      const s: Settings = body.settings;
      setSettings(s);
      setForm({
        vatRatePercent: s.vatRatePercent,
        whatsappNumber: s.whatsappNumber,
        whatsappDisplay: s.whatsappDisplay,
        brandName: s.brandName,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    if (!settings) return;
    setForm({
      vatRatePercent: settings.vatRatePercent,
      whatsappNumber: settings.whatsappNumber,
      whatsappDisplay: settings.whatsappDisplay,
      brandName: settings.brandName,
    });
    setError(null);
    setSaved(false);
  }

  // ==================================================
  // Payment costs handlers
  // ==================================================
  function updateCost<K extends keyof PaymentCostForm>(
    method: PaymentMethod,
    key: K,
    value: PaymentCostForm[K]
  ) {
    setCostForms((prev) => ({
      ...prev,
      [method]: { ...prev[method], [key]: value },
    }));
    setCostsSaved(false);
    setCostsError(null);
  }

  async function handleSaveCosts() {
    setCostsError(null);
    setCostsSaved(false);

    // Client-side validation first — fail fast
    for (const method of ALL_METHODS) {
      const f = costForms[method];
      const percent = Number(f.percent);
      const fixedEuro = Number(f.fixedEuro);

      if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
        setCostsError(
          `${METHOD_LABELS[method]}: percentage must be between 0 and 100`
        );
        return;
      }
      if (!Number.isFinite(fixedEuro) || fixedEuro < 0) {
        setCostsError(
          `${METHOD_LABELS[method]}: fixed fee must be 0 or higher`
        );
        return;
      }
    }

    setCostsSaving(true);
    try {
      const results = await Promise.all(
        ALL_METHODS.map(async (method) => {
          const f = costForms[method];
          const percentageBps = Math.round(Number(f.percent) * 100);
          const fixedAmount = Math.round(Number(f.fixedEuro) * 100);

          const res = await fetch(
            `/api/super-admin/payment-costs?method=${method}`,
            {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                mode: f.mode,
                percentageBps,
                fixedAmount,
                isActive: f.isActive,
              }),
            }
          );
          const body = await res.json().catch(() => ({}));
          return { method, ok: res.ok, body };
        })
      );

      const failed = results.find((r) => !r.ok);
      if (failed) {
        setCostsError(
          failed.body?.error ||
            `Failed to save ${METHOD_LABELS[failed.method]}`
        );
        return;
      }

      // Reload the rows to reflect exact stored values
      const res = await fetch("/api/super-admin/payment-costs", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        const rows: PaymentCostRow[] = data.costs ?? [];
        setCosts(rows);

        const map: Record<PaymentMethod, PaymentCostForm> = {
          ...DEFAULT_COST_FORMS,
        };
        for (const row of rows) {
          map[row.method] = {
            mode: row.mode,
            percent: (row.percentageBps / 100).toString(),
            fixedEuro: (row.fixedAmount / 100).toString(),
            isActive: row.isActive,
          };
        }
        setCostForms(map);
      }

      setCostsSaved(true);
      setTimeout(() => setCostsSaved(false), 3000);
    } catch (err) {
      console.error(err);
      setCostsError("Network error");
    } finally {
      setCostsSaving(false);
    }
  }

  function handleResetCosts() {
    const map: Record<PaymentMethod, PaymentCostForm> = {
      ...DEFAULT_COST_FORMS,
    };
    for (const row of costs) {
      map[row.method] = {
        mode: row.mode,
        percent: (row.percentageBps / 100).toString(),
        fixedEuro: (row.fixedAmount / 100).toString(),
        isActive: row.isActive,
      };
    }
    setCostForms(map);
    setCostsError(null);
    setCostsSaved(false);
  }

  return (
    <div className="sa-settings">
      <header className="sa-settings-header">
        <h1 className="sa-settings-title">Settings</h1>
        <p className="sa-settings-subtitle">
          Configure platform-wide values used across PDFs, emails, and the
          checkout flow
        </p>
      </header>

      {loading && <div className="sa-settings-empty">Loading settings…</div>}

      {error && <div className="sa-settings-error">{error}</div>}

      {!loading && (
        <>
          {/* ========================================= */}
          {/* General Settings form                      */}
          {/* ========================================= */}
          <form onSubmit={handleSubmit} className="sa-settings-form">
            {/* ---- Financial ---- */}
            <section className="sa-settings-card">
              <div className="sa-settings-card-header">
                <h2 className="sa-settings-card-title">Financial</h2>
                <p className="sa-settings-card-desc">
                  Applied to invoices and revenue calculations
                </p>
              </div>

              <label className="sa-form-field">
                <span className="sa-form-label">VAT rate (%)</span>
                <input
                  type="text"
                  className="sa-form-input sa-form-input-short"
                  value={form.vatRatePercent}
                  onChange={(e) => update("vatRatePercent", e.target.value)}
                  placeholder="13.50"
                  autoComplete="off"
                  spellCheck={false}
                />
                <span className="sa-form-hint">
                  Percentage of the gross total. For €100 gross, 13.50% VAT
                  means €86.50 net + €13.50 VAT.
                </span>
              </label>
            </section>

            {/* ---- Customer contact ---- */}
            <section className="sa-settings-card">
              <div className="sa-settings-card-header">
                <h2 className="sa-settings-card-title">Customer Contact</h2>
                <p className="sa-settings-card-desc">
                  Shown to customers on the benefit payment instructions page
                </p>
              </div>

              <label className="sa-form-field">
                <span className="sa-form-label">
                  WhatsApp number (digits only)
                </span>
                <input
                  type="text"
                  className="sa-form-input sa-form-input-mono"
                  value={form.whatsappNumber}
                  onChange={(e) => update("whatsappNumber", e.target.value)}
                  placeholder="358442363616"
                  autoComplete="off"
                  spellCheck={false}
                />
                <span className="sa-form-hint">
                  International format, digits only, no + or spaces. Used to
                  build the wa.me link.
                </span>
              </label>

              <label className="sa-form-field">
                <span className="sa-form-label">
                  WhatsApp display format
                </span>
                <input
                  type="text"
                  className="sa-form-input"
                  value={form.whatsappDisplay}
                  onChange={(e) => update("whatsappDisplay", e.target.value)}
                  placeholder="+358 442363616"
                  autoComplete="off"
                  spellCheck={false}
                />
                <span className="sa-form-hint">
                  How the number appears to customers.
                </span>
              </label>
            </section>

            {/* ---- Branding ---- */}
            <section className="sa-settings-card">
              <div className="sa-settings-card-header">
                <h2 className="sa-settings-card-title">Branding</h2>
                <p className="sa-settings-card-desc">
                  Appears on ticket PDFs, invoices, and customer emails
                </p>
              </div>

              <label className="sa-form-field">
                <span className="sa-form-label">Brand name</span>
                <input
                  type="text"
                  className="sa-form-input"
                  value={form.brandName}
                  onChange={(e) => update("brandName", e.target.value)}
                  placeholder="Taprobane Entertainment"
                  autoComplete="off"
                />
                <span className="sa-form-hint">
                  Shown at the top of every ticket and invoice PDF.
                </span>
              </label>
            </section>

            <div className="sa-settings-actions">
              {saved && <span className="sa-save-toast">✓ Saved</span>}
              <button
                type="button"
                className="sa-settings-btn sa-settings-btn-cancel"
                onClick={handleReset}
                disabled={saving}
              >
                Reset
              </button>
              <button
                type="submit"
                className="sa-settings-btn sa-settings-btn-primary"
                disabled={saving}
              >
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>

            {settings && (
              <p className="sa-settings-updated">
                Last updated{" "}
                {new Date(settings.updatedAt).toLocaleString("en-GB")}
              </p>
            )}
          </form>

          {/* ========================================= */}
          {/* Payment Method Costs                       */}
          {/* ========================================= */}
          <section className="sa-settings-form" style={{ marginTop: 24 }}>
            <section className="sa-settings-card">
              <div className="sa-settings-card-header">
                <h2 className="sa-settings-card-title">
                  Payment Method Costs
                </h2>
                <p className="sa-settings-card-desc">
                  Fee per transaction applied by each payment provider. Used
                  to calculate net revenue in finance reports.
                </p>
              </div>

              {costsError && (
                <div
                  className="sa-settings-error"
                  style={{ marginBottom: 16 }}
                >
                  {costsError}
                </div>
              )}

              {costsLoading ? (
                <p className="sa-settings-empty" style={{ padding: 24 }}>
                  Loading payment costs…
                </p>
              ) : (
                <>
                  <div className="sa-cost-grid">
                    {ALL_METHODS.map((method) => {
                      const f = costForms[method];
                      const preview = computePreview(
                        f.mode,
                        Number(f.percent) || 0,
                        Number(f.fixedEuro) || 0
                      );

                      return (
                        <div
                          key={method}
                          className={`sa-cost-card sa-cost-${method}`}
                        >
                          <div className="sa-cost-header">
                            <span className="sa-cost-name">
                              {METHOD_LABELS[method]}
                            </span>
                            <label className="sa-cost-toggle">
                              <input
                                type="checkbox"
                                checked={f.isActive}
                                onChange={(e) =>
                                  updateCost(
                                    method,
                                    "isActive",
                                    e.target.checked
                                  )
                                }
                              />
                              <span>Active</span>
                            </label>
                          </div>

                          <label className="sa-form-field">
                            <span className="sa-form-label">Fee model</span>
                            <select
                              className="sa-form-input"
                              value={f.mode}
                              onChange={(e) =>
                                updateCost(
                                  method,
                                  "mode",
                                  e.target.value as PaymentCostMode
                                )
                              }
                            >
                              <option value="percentage_plus_fixed">
                                Percentage + fixed
                              </option>
                              <option value="percentage_or_fixed">
                                Higher of percentage or fixed
                              </option>
                            </select>
                          </label>

                          <div className="sa-cost-row">
                            <label className="sa-form-field">
                              <span className="sa-form-label">
                                Percentage (%)
                              </span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                className="sa-form-input"
                                value={f.percent}
                                onChange={(e) =>
                                  updateCost(
                                    method,
                                    "percent",
                                    e.target.value
                                  )
                                }
                                placeholder="1.5"
                              />
                            </label>

                            <label className="sa-form-field">
                              <span className="sa-form-label">
                                Fixed (€)
                              </span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="sa-form-input"
                                value={f.fixedEuro}
                                onChange={(e) =>
                                  updateCost(
                                    method,
                                    "fixedEuro",
                                    e.target.value
                                  )
                                }
                                placeholder="0.25"
                              />
                            </label>
                          </div>

                          <p className="sa-cost-preview">
                            <strong>Preview:</strong> on a €100 order, fee ={" "}
                            <strong>€{preview.toFixed(2)}</strong>
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  <div
                    className="sa-settings-actions"
                    style={{ marginTop: 20 }}
                  >
                    {costsSaved && (
                      <span className="sa-save-toast">✓ Saved</span>
                    )}
                    <button
                      type="button"
                      className="sa-settings-btn sa-settings-btn-cancel"
                      onClick={handleResetCosts}
                      disabled={costsSaving}
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      className="sa-settings-btn sa-settings-btn-primary"
                      onClick={handleSaveCosts}
                      disabled={costsSaving}
                    >
                      {costsSaving ? "Saving…" : "Save Payment Costs"}
                    </button>
                  </div>
                </>
              )}
            </section>
          </section>
        </>
      )}
    </div>
  );
}

// ======================================================
// Preview calculator
// ======================================================

function computePreview(
  mode: PaymentCostMode,
  percent: number,
  fixedEuro: number
): number {
  const amount = 100;
  const pctFee = (amount * percent) / 100;
  if (mode === "percentage_plus_fixed") {
    return pctFee + fixedEuro;
  }
  return Math.max(pctFee, fixedEuro);
}