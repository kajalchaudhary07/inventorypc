import { useState } from "react";
import toast from "react-hot-toast";
import { Plus, Trash2, Layers, Wand2 } from "lucide-react";
import { Button, Card, Field, Input, PageHeader, EmptyState, Badge } from "@/components/ui/primitives";
import { useDataStore } from "@/store/dataStore";
import { saveDoc, logActivity } from "@/services/data";
import { uid, inr } from "@/lib/utils";
import type { ItemGroup, Product } from "@/types";

interface Attr { name: string; options: string }
interface VariantRow { key: string; attrs: Record<string, string>; sku: string; cost: number; price: number; stock: number }

function cartesian(attrs: { name: string; options: string[] }[]): Record<string, string>[] {
  return attrs.reduce<Record<string, string>[]>(
    (acc, a) => acc.flatMap((combo) => a.options.map((opt) => ({ ...combo, [a.name]: opt }))),
    [{}]
  );
}

export default function ItemGroups() {
  const groups = useDataStore((s) => s.itemGroups);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [gst, setGst] = useState(18);
  const [attrs, setAttrs] = useState<Attr[]>([{ name: "Shade", options: "Black, Brown, Blonde" }]);
  const [variants, setVariants] = useState<VariantRow[]>([]);

  const parsedAttrs = () =>
    attrs
      .filter((a) => a.name && a.options.trim())
      .map((a) => ({ name: a.name, options: a.options.split(",").map((o) => o.trim()).filter(Boolean) }));

  const generate = () => {
    const pa = parsedAttrs();
    if (!name || !pa.length) { toast.error("Add a group name and at least one attribute"); return; }
    const combos = cartesian(pa);
    setVariants(
      combos.map((attrsMap) => ({
        key: uid(),
        attrs: attrsMap,
        sku: `${name.slice(0, 3).toUpperCase()}-${Object.values(attrsMap).map((v) => v.slice(0, 2).toUpperCase()).join("")}`,
        cost: 0,
        price: 0,
        stock: 0,
      }))
    );
  };

  const create = async () => {
    const pa = parsedAttrs();
    const group: ItemGroup = { id: uid(), name, brand, category, unit, attributes: pa, createdAt: Date.now() };
    await saveDoc("itemGroups", group);
    for (const v of variants) {
      const product: Product = {
        id: uid(),
        name: `${name} - ${Object.values(v.attrs).join("/")}`,
        sku: v.sku,
        brand,
        category,
        unit,
        stock: Number(v.stock),
        reserved: 0,
        reorderLevel: 10,
        costPrice: Number(v.cost),
        sellingPrice: Number(v.price),
        gstRate: gst,
        groupId: group.id,
        attributes: v.attrs,
        status: "active",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await saveDoc("products", product);
    }
    logActivity("Created item group", "itemGroup", `${name} (${variants.length} variants)`);
    toast.success(`Created ${variants.length} variants`);
    setName(""); setBrand(""); setCategory(""); setVariants([]);
  };

  return (
    <div>
      <PageHeader title="Item Groups & Variants" subtitle="Generate product variants from attributes (e.g. Size, Shade)." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">New Item Group</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Group name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Shampoo" /></Field>
            <Field label="Brand"><Input value={brand} onChange={(e) => setBrand(e.target.value)} /></Field>
            <Field label="Category"><Input value={category} onChange={(e) => setCategory(e.target.value)} /></Field>
            <Field label="Unit"><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></Field>
            <Field label="GST %"><Input type="number" value={gst} onChange={(e) => setGst(Number(e.target.value))} /></Field>
          </div>

          <div className="mt-4 space-y-3">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Attributes</span>
            {attrs.map((a, i) => (
              <div key={i} className="flex items-end gap-2">
                <Field label="Attribute"><Input value={a.name} onChange={(e) => setAttrs(attrs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="Size" /></Field>
                <Field label="Options (comma separated)"><Input value={a.options} onChange={(e) => setAttrs(attrs.map((x, j) => j === i ? { ...x, options: e.target.value } : x))} placeholder="100ml, 250ml, 500ml" /></Field>
                <button onClick={() => setAttrs(attrs.filter((_, j) => j !== i))} className="mb-1 rounded-lg p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
            <button onClick={() => setAttrs([...attrs, { name: "", options: "" }])} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600">
              <Plus className="h-4 w-4" /> Add attribute
            </button>
          </div>

          <Button className="mt-5 w-full" variant="secondary" onClick={generate}><Wand2 className="h-4 w-4" /> Generate variants</Button>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Variant Preview {variants.length > 0 && `(${variants.length})`}</h3>
            {variants.length > 0 && <Button onClick={create}><Plus className="h-4 w-4" /> Create all</Button>}
          </div>
          {variants.length === 0 ? (
            <EmptyState icon={Layers} title="No variants yet" hint="Define attributes on the left and click Generate." />
          ) : (
            <div className="max-h-[420px] space-y-2 overflow-y-auto">
              {variants.map((v, i) => (
                <div key={v.key} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    {Object.entries(v.attrs).map(([k, val]) => <Badge key={k} color="violet">{k}: {val}</Badge>)}
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <Input value={v.sku} onChange={(e) => setVariants(variants.map((x, j) => j === i ? { ...x, sku: e.target.value } : x))} placeholder="SKU" />
                    <Input type="number" value={v.cost} onChange={(e) => setVariants(variants.map((x, j) => j === i ? { ...x, cost: Number(e.target.value) } : x))} placeholder="Cost" />
                    <Input type="number" value={v.price} onChange={(e) => setVariants(variants.map((x, j) => j === i ? { ...x, price: Number(e.target.value) } : x))} placeholder="Price" />
                    <Input type="number" value={v.stock} onChange={(e) => setVariants(variants.map((x, j) => j === i ? { ...x, stock: Number(e.target.value) } : x))} placeholder="Stock" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <h3 className="mb-3 mt-8 text-sm font-semibold text-slate-900 dark:text-white">Existing Groups</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <Card key={g.id} className="p-4">
            <div className="font-semibold text-slate-900 dark:text-white">{g.name}</div>
            <div className="text-xs text-slate-400">{g.brand} · {g.category}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {g.attributes.map((a) => <Badge key={a.name} color="slate">{a.name}: {a.options.length}</Badge>)}
            </div>
          </Card>
        ))}
        {!groups.length && <p className="text-sm text-slate-400">No groups created yet.</p>}
      </div>
    </div>
  );
}
