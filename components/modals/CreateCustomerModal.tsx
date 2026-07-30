"use client";

import { useState } from "react";
import { db } from "@/lib/firebase";
import { ref, push, set } from "firebase/database";
import { X } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateCustomerModal({ isOpen, onClose }: Props) {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone) return;

    setIsSubmitting(true);
    try {
      const customersRef = ref(db, "customers");
      const newCustRef = push(customersRef);
      await set(newCustRef, {
        name,
        company: company || "Individual Owner",
        phone,
        email,
        address,
        projectsCount: 0,
        totalBilled: 0,
        tenantId: "tn_default",
        createdAt: Date.now(),
      });
      onClose();
    } catch (err) {
      console.error("Failed to add customer", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', itemsCenter: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div className="modal-dialog card" style={{ width: '100%', maxWidth: '480px', padding: '1.5rem', background: '#fff', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--slate-200)' }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--slate-900)' }}>Add Client / Project Owner</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-500)' }}><X style={{ width: '20px', height: '20px' }} /></button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--slate-700)', marginBottom: '0.25rem' }}>Client / Company Name *</label>
            <input type="text" required placeholder="e.g. Apex Holdings Ltd." value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', borderRadius: '8px', border: '1px solid var(--slate-300)', background: 'var(--slate-50)' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--slate-700)', marginBottom: '0.25rem' }}>Business Type / Sector</label>
            <input type="text" placeholder="e.g. Real Estate Developer / Govt" value={company} onChange={(e) => setCompany(e.target.value)} style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', borderRadius: '8px', border: '1px solid var(--slate-300)', background: 'var(--slate-50)' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--slate-700)', marginBottom: '0.25rem' }}>Phone Number *</label>
              <input type="text" required placeholder="+880 1700-000000" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', borderRadius: '8px', border: '1px solid var(--slate-300)', background: 'var(--slate-50)' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--slate-700)', marginBottom: '0.25rem' }}>Email Address</label>
              <input type="email" placeholder="client@company.com" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', borderRadius: '8px', border: '1px solid var(--slate-300)', background: 'var(--slate-50)' }} />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--slate-700)', marginBottom: '0.25rem' }}>Office Address</label>
            <input type="text" placeholder="Gulshan-1, Dhaka" value={address} onChange={(e) => setAddress(e.target.value)} style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', borderRadius: '8px', border: '1px solid var(--slate-300)', background: 'var(--slate-50)' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--slate-200)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save Client"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
