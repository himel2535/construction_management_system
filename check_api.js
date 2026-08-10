const API = "https://constructionmanagementsystembackend-production.up.railway.app/api";
const headers = { "Content-Type": "application/json" };

const today = new Date();
const dates = Array.from({length: 7}, (_, i) => {
  const d = new Date(today);
  d.setDate(d.getDate() - i);
  return d.toISOString().split('T')[0];
});

async function check() {
  try {
    const res = await fetch(`${API}/clientInvoices`, {
      method: "POST", headers,
      body: JSON.stringify({
        invoiceNumber: `INV-${Math.floor(Math.random() * 1000)}`,
        projectId: "proj-1",
        billDate: dates[2],
        paidDate: dates[2],
        totalAmount: 60000,
        paidAmount: 60000,
        status: "paid"
      })
    });
    console.log("Status:", res.status);
    console.log("Response:", await res.text());
  } catch (err) {
    console.error("Fetch Error:", err);
  }
}
check();
