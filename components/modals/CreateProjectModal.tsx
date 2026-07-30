"use client";

import { useState } from "react";
import { db } from "@/lib/firebase";
import { ref, push, set } from "firebase/database";
import { X } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function CreateProjectModal({ isOpen, onClose }: Props) {
  const [name, setName] = useState("");
  const [code, setCode] = useState(`PRJ-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`);
  const [type, setType] = useState<"government" | "private">("private");
  const [clientName, setClientName] = useState("");
  const [contractValue, setContractValue] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [estimatedEndDate, setEstimatedEndDate] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !contractValue) return;

    setIsSubmitting(true);
    try {
      const projectsRef = ref(db, "projects");
      const newProjRef = push(projectsRef);
      await set(newProjRef, {
        name,
        code,
        type,
        clientName: clientName || "General Client",
        contractValue: Number(contractValue),
        spentAmount: 0,
        location: location || "Dhaka, Bangladesh",
        status: "active",
        startDate,
        estimatedEndDate: estimatedEndDate || startDate,
        tenantId: "tn_default",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      onClose();
    } catch (err) {
      console.error("Failed to create project in Firebase", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div className="modal-dialog card" style={{ width: '100%', maxWidth: '560px', padding: '1.5rem', background: '#fff', borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--slate-200)' }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 700, color: 'var(--slate-900)' }}>Create New Construction Project</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate-500)' }}>
            <X style={{ width: '20px', height: '20px' }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--slate-700)', marginBottom: '0.25rem' }}>Project Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. Uttara Commercial Tower"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', borderRadius: '8px', border: '1px solid var(--slate-300)', background: 'var(--slate-50)' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--slate-700)', marginBottom: '0.25rem' }}>Project Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', borderRadius: '8px', border: '1px solid var(--slate-300)', background: 'var(--slate-50)' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--slate-700)', marginBottom: '0.25rem' }}>Project Category</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as "government" | "private")}
                style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', borderRadius: '8px', border: '1px solid var(--slate-300)', background: 'var(--slate-50)' }}
              >
                <option value="private">Private Development</option>
                <option value="government">Government Tender / RHD</option>
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--slate-700)', marginBottom: '0.25rem' }}>Client / Employer Name</label>
              <input
                type="text"
                placeholder="e.g. Apex Holdings"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', borderRadius: '8px', border: '1px solid var(--slate-300)', background: 'var(--slate-50)' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--slate-700)', marginBottom: '0.25rem' }}>Contract Value (BDT ৳) *</label>
              <input
                type="number"
                required
                placeholder="e.g. 50000000"
                value={contractValue}
                onChange={(e) => setContractValue(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', borderRadius: '8px', border: '1px solid var(--slate-300)', background: 'var(--slate-50)' }}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--slate-700)', marginBottom: '0.25rem' }}>Site Location</label>
            <input
              type="text"
              placeholder="e.g. Sector 11, Uttara, Dhaka"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', borderRadius: '8px', border: '1px solid var(--slate-300)', background: 'var(--slate-50)' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--slate-700)', marginBottom: '0.25rem' }}>Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', borderRadius: '8px', border: '1px solid var(--slate-300)', background: 'var(--slate-50)' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--slate-700)', marginBottom: '0.25rem' }}>Estimated End Date</label>
              <input
                type="date"
                value={estimatedEndDate}
                onChange={(e) => setEstimatedEndDate(e.target.value)}
                style={{ width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', borderRadius: '8px', border: '1px solid var(--slate-300)', background: 'var(--slate-50)' }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--slate-200)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? "Creating Project..." : "Save Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
