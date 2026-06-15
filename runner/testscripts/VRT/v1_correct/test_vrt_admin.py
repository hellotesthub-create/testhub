"""
Visual Regression workflow demo — VERSION 1 (correct / baseline UI).

Run this FIRST. It renders the "Orders Admin" dashboard and captures a screenshot
at the stable step `admin_dashboard`. Because the file is named test_vrt_admin.py,
the Visual Regression engine creates the baseline under:
    baselines/<framework>/<browser>/test_vrt_admin.py/admin_dashboard.png

Then run the v2_changed/test_vrt_admin.py script (same name, changed UI): the
engine compares it against THIS baseline and highlights the differences.

The UI is rendered inline via page.set_content(), so the test is fully
self-contained and deterministic (no network, no external files).
"""

from playwright.sync_api import Page
import os

SCREENSHOTS_DIR = os.getenv("SCREENSHOTS_DIR", "/app/output/screenshots")

HTML = r"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><style>
  :root{--bg:#f1f5f9;--card:#fff;--text:#0f172a;--muted:#64748b;--border:#e2e8f0;
        --primary:#2563eb;--green:#16a34a;--amber:#d97706;--red:#dc2626;}
  *{margin:0;padding:0;box-sizing:border-box;font-family:-apple-system,system-ui,"Segoe UI",Roboto,Arial,sans-serif;}
  body{background:var(--bg);color:var(--text);}
  .topbar{height:64px;background:#fff;border-bottom:1px solid var(--border);display:flex;align-items:center;
          justify-content:space-between;padding:0 28px;}
  .brand{display:flex;align-items:center;gap:10px;font-size:19px;font-weight:800;}
  .brand .logo{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#2563eb,#3b82f6);
               display:flex;align-items:center;justify-content:center;font-size:17px;}
  .right{display:flex;align-items:center;gap:18px;}
  .search{background:var(--bg);border:1px solid var(--border);border-radius:9px;padding:8px 14px;width:240px;
          font-size:13px;color:var(--muted);}
  .bell{position:relative;font-size:19px;}
  .btn{padding:9px 18px;border-radius:9px;font-size:13.5px;font-weight:700;color:#fff;border:none;background:var(--primary);}
  .avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;
          display:flex;align-items:center;justify-content:center;font-weight:600;font-size:13px;}
  .wrap{padding:26px 28px;}
  .h1{font-size:22px;font-weight:800;margin-bottom:2px;display:flex;align-items:center;gap:10px;}
  .sub{color:var(--muted);font-size:13.5px;margin-bottom:22px;}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;}
  .stat{background:var(--card);border:1px solid var(--border);border-radius:14px;padding:18px;}
  .stat .l{color:var(--muted);font-size:12.5px;font-weight:500;margin-bottom:8px;}
  .stat .v{font-size:24px;font-weight:800;letter-spacing:-.5px;}
  .panel{background:var(--card);border:1px solid var(--border);border-radius:14px;overflow:hidden;}
  .panel h3{font-size:15px;font-weight:700;padding:16px 20px;border-bottom:1px solid var(--border);}
  table{width:100%;border-collapse:collapse;}
  th,td{text-align:left;padding:12px 20px;font-size:13.5px;border-bottom:1px solid var(--border);}
  th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.4px;}
  tr:last-child td{border-bottom:none;}
  .pill{padding:4px 11px;border-radius:999px;font-size:12px;font-weight:700;}
  .p-ship{background:#dcfce7;color:var(--green);}
  .p-proc{background:#fef3c7;color:var(--amber);}
  .p-pend{background:#f1f5f9;color:var(--muted);}
  .p-delay{background:#fee2e2;color:var(--red);}
</style></head>
<body>
  <div class="topbar">
    <div class="brand"><span class="logo">🛍</span> Orders Admin</div>
    <div class="right">
      <div class="search">🔍 Search orders…</div>
      <div class="bell">🔔</div>
      <button class="btn">Export</button>
      <div class="avatar">AK</div>
    </div>
  </div>
  <div class="wrap">
    <div class="h1">Orders Overview</div>
    <div class="sub">Monitor and manage all store orders in real time.</div>
    <div class="stats">
      <div class="stat"><div class="l">Total Orders</div><div class="v">1,284</div></div>
      <div class="stat"><div class="l">Revenue</div><div class="v">$48,250</div></div>
      <div class="stat"><div class="l">Pending</div><div class="v">36</div></div>
      <div class="stat"><div class="l">Refunds</div><div class="v">8</div></div>
    </div>
    <div class="panel">
      <h3>Recent Orders</h3>
      <table>
        <thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>
          <tr><td>#1001</td><td>Sara Khan</td><td>$120.00</td><td><span class="pill p-ship">Shipped</span></td></tr>
          <tr><td>#1002</td><td>Ali Raza</td><td>$89.00</td><td><span class="pill p-proc">Processing</span></td></tr>
          <tr><td>#1003</td><td>Mert Yilmaz</td><td>$240.00</td><td><span class="pill p-ship">Shipped</span></td></tr>
          <tr><td>#1004</td><td>Lina Park</td><td>$54.00</td><td><span class="pill p-pend">Pending</span></td></tr>
          <tr><td>#1005</td><td>John Doe</td><td>$310.00</td><td><span class="pill p-ship">Shipped</span></td></tr>
        </tbody>
      </table>
    </div>
  </div>
</body></html>"""


def capture_step(page: Page, step_name: str):
    os.makedirs(SCREENSHOTS_DIR, exist_ok=True)
    page.screenshot(path=f"{SCREENSHOTS_DIR}/{step_name}.png")


def run_test(page: Page):
    print("VRT workflow demo — v1 (correct baseline UI)")
    page.set_content(HTML)
    page.wait_for_load_state("load")
    # Stabilize: freeze animations + wait for fonts so screenshots are deterministic.
    page.add_style_tag(content="*{animation:none!important;transition:none!important;caret-color:transparent!important;}")
    try:
        page.wait_for_function("() => document.fonts && document.fonts.status === 'loaded'", timeout=4000)
    except Exception:
        pass
    page.wait_for_timeout(250)
    capture_step(page, "admin_dashboard")
    return True
