"use client";

import { useState } from "react";
import { db } from "@/lib/firebase";
import { ref, push, set } from "firebase/database";
import { X } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function AddInventoryModal({ isOpen, onClose }: Props) {
  const [name, setName] = useState("");
  const [code, setCode] = useState(`MAT-${Math.floor(100 + Math.random() * 900)}`);
  const [category, setCategory] = useState("Cement");
  const [unit, setUnit] = useState("Bag");
  const [quantity, setQuantity] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [reorderLevel, setReorderLevel] = useState("100");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !quantity) return;

    setIsSubmitting(true);
    try {
      const invRef = ref(db, "inventory");
      const newItemRef = push(invRef);
      await set(newItemRef, {
        name,
        code,
        category,
        unit,
        quantity: Number(quantity),
        unitPrice: Number(unitPrice || 0),
        reorderLevel: Number(reorderLevel || 50),
        tenantId: "tn_default",
        updatedAt: Date.now(),
      });
      onClose();
    } catch (err) {
      console.error("Failed to add inventory item", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div className="modal-dialog card" style={{ width: '100%', maxWidth: '480px', padding: '1.5rem', background: '#fff', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--slate-200)' }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--slate-900)' }}>Add Material Stock Item</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-500)' }}><X style={{ width: '20px', height: '20px' }} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--slate-700)', marginBottom: '0.25rem' }}>Material Item Name *</label>
            <input type="text" required placeholder="e.g. 500W Deformed Steel Rebar (16mm)" value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', borderRadius: '8px', border: '1px solid var(--slate-300)', background: 'var(--slate-50)' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--slate-700)', marginBottom: '0.25rem' }}>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', borderRadius: '8px', border: '1px solid var(--slate-300)', background: 'var(--slate-50)' }}>
                <option value="Cement">Cement</option>
                <option value="Steel & Rebar">Steel & Rebar</option>
                <option value="Aggregates">Aggregates (Sand/Stone)</option>
                <option value="Masonry">Bricks & Blocks</option>
                <option value="Hardware & Plumbing">Hardware & Plumbing</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--slate-700)', marginBottom: '0.25rem' }}>Unit of Measure</label>
              <input type="text" placeholder="Bag / Ton / CFT / Pcs" value={unit} onChange={(e) => setUnit(e.target.value)} style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', borderRadius: '8px', border: '1px solid var(--slate-300)', background: 'var(--slate-50)' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--slate-700)', marginBottom: '0.25rem' }}>Quantity *</label>
              <input type="number" required placeholder="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', borderRadius: '8px', border: '1px solid var(--slate-300)', background: 'var(--slate-50)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--slate-700)', marginBottom: '0.25rem' }}>Unit Price (৳)</label>
              <input type="number" placeholder="540" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', borderRadius: '8px', border: '1px solid var(--slate-300)', background: 'var(--slate-50)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--slate-700)', marginBottom: '0.25rem' }}>Reorder Level</label>
              <input type="number" placeholder="100" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', borderRadius: '8px', border: '1px solid var(--slate-300)', background: 'var(--slate-50)' }} />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--slate-200)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save Stock Item"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
