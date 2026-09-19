"use client";

import "./Dashboard.css";

export default function SuperAdminDashboard() {
  const functions = [
    { name: "Manage Users", path: "/super-admin/users" },
    { name: "Inventory", path: "/super-admin/inventory" },
    { name: "Orders", path: "/super-admin/orders" },
    { name: "Reports", path: "/super-admin/reports" },
    { name: "Audit Logs", path: "/super-admin/logs" },
    { name: "Settings", path: "/super-admin/settings" },
  ];

  return (
    <div className="sa-dashboard">
      <h1 className="sa-title">Dashboard</h1>

      <section className="sa-grid">
        {functions.map((f) => (
          <a key={f.name} href={f.path} className="sa-card">
            <span>{f.name}</span>
          </a>
        ))}
      </section>
    </div>
  );
}
