import toast from "react-hot-toast";
import { Save, Receipt, Barcode, Bell, Building2 } from "lucide-react";
import { Button, Card, Field, Input, PageHeader } from "@/components/ui/primitives";
import { useUIStore } from "@/store/uiStore";

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</div>
        {hint && <div className="text-xs text-slate-400">{hint}</div>}
      </div>
      <button onClick={() => onChange(!checked)} className={`relative h-6 w-11 rounded-full transition ${checked ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

export default function Settings() {
  const { settings, setSettings } = useUIStore();

  return (
    <div>
      <PageHeader title="Settings" subtitle="Configure GST, invoicing, barcode and notifications."
        actions={<Button onClick={() => toast.success("Settings saved")}><Save className="h-4 w-4" /> Save</Button>} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Building2 className="h-4 w-4" /> Company</h3>
          <div className="space-y-4">
            <Field label="Company name"><Input value={settings.companyName} onChange={(e) => setSettings({ companyName: e.target.value })} /></Field>
            <Field label="Currency symbol"><Input value={settings.currencySymbol} onChange={(e) => setSettings({ currencySymbol: e.target.value })} /></Field>
            <Field label="Address (line)"><Input value={settings.companyAddress} onChange={(e) => setSettings({ companyAddress: e.target.value })} /></Field>
            <Field label="City / PIN"><Input value={settings.companyCity} onChange={(e) => setSettings({ companyCity: e.target.value })} /></Field>
            <Field label="State / Country"><Input value={settings.companyState} onChange={(e) => setSettings({ companyState: e.target.value })} /></Field>
            <Field label="Company GSTIN"><Input value={settings.companyGstin} onChange={(e) => setSettings({ companyGstin: e.target.value })} /></Field>
            <Field label="Phone"><Input value={settings.companyPhone} onChange={(e) => setSettings({ companyPhone: e.target.value })} /></Field>
            <Field label="Email"><Input value={settings.companyEmail} onChange={(e) => setSettings({ companyEmail: e.target.value })} /></Field>
            <Field label="Website"><Input value={settings.companyWebsite} onChange={(e) => setSettings({ companyWebsite: e.target.value })} /></Field>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Receipt className="h-4 w-4" /> GST & Invoicing</h3>
          <div className="space-y-4">
            <Field label="Default GST rate (%)"><Input type="number" value={settings.defaultGst} onChange={(e) => setSettings({ defaultGst: Number(e.target.value) })} /></Field>
            <Field label="Invoice prefix"><Input value={settings.invoicePrefix} onChange={(e) => setSettings({ invoicePrefix: e.target.value })} /></Field>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Barcode className="h-4 w-4" /> Inventory</h3>
          <Toggle checked={settings.enableBarcode} onChange={(v) => setSettings({ enableBarcode: v })} label="Enable barcode scanning" hint="Show barcode field on products & allow scan-to-add." />
        </Card>

        <Card className="p-5">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"><Bell className="h-4 w-4" /> Notifications</h3>
          <Toggle checked={settings.lowStockNotifications} onChange={(v) => setSettings({ lowStockNotifications: v })} label="Low stock alerts" hint="Notify when available stock falls to the reorder level." />
          <Toggle checked={settings.expiryAlerts} onChange={(v) => setSettings({ expiryAlerts: v })} label="Expiry alerts" hint="Flag expiry-tracked products nearing expiry." />
        </Card>
      </div>
    </div>
  );
}
