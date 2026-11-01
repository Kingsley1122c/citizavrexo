import type { Metadata } from "next";
import Image from "next/image";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Check,
  ChevronRight,
  CreditCard,
  Eye,
  Fingerprint,
  Globe2,
  LayoutDashboard,
  LockKeyhole,
  ReceiptText,
  Send,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "CITIZAVREXO Identity Review",
  robots: { index: false, follow: false },
};

const transactions = [
  { icon: ArrowDownLeft, name: "Salary deposit", date: "Today, 09:42", amount: "+$4,850.00", positive: true },
  { icon: ArrowUpRight, name: "Alpine Workspace", date: "Yesterday, 16:18", amount: "-$680.00", positive: false },
  { icon: Send, name: "Transfer to Amara", date: "May 24, 11:06", amount: "-$1,250.00", positive: false },
];

function Logo({ dark = false, className = "" }: { dark?: boolean; className?: string }) {
  return (
    <Image
      className={className}
      src={dark ? "/brand/logo-horizontal-dark.svg" : "/brand/logo-horizontal-light.svg"}
      width={500}
      height={96}
      alt="CITIZAVREXO"
      priority
    />
  );
}

export default function BrandPreviewPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <header className={styles.heroNav}>
          <Logo dark className={styles.navLogo} />
          <span className={styles.reviewLabel}>Identity review · 01</span>
        </header>
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <span className={styles.kicker}>International financial technology</span>
            <h1>CITIZAVREXO</h1>
            <p>A precise identity built around trust, clarity and forward momentum.</p>
          </div>
          <div className={styles.heroMark} aria-label="CITIZAVREXO architectural C symbol">
            <Image src="/brand/logo-symbol-dark.svg" width={64} height={64} alt="" />
          </div>
        </div>
        <div className={styles.heroFooter}>
          <span>Architectural C</span>
          <span>Midnight · Emerald · Champagne</span>
          <span>2026</span>
        </div>
      </section>

      <section className={styles.system}>
        <div className={styles.sectionLead}>
          <span className={styles.index}>01 / Core system</span>
          <div>
            <h2>One mark. Every financial surface.</h2>
            <p>The open C creates a stable frame. Its inner rail signals protected movement; champagne-cut terminals add distinction without becoming an arrow.</p>
          </div>
        </div>
        <div className={styles.logoBoard}>
          <div className={styles.logoLight}>
            <Logo className={styles.signature} />
            <small>Primary · light surface</small>
          </div>
          <div className={styles.logoDark}>
            <Logo dark className={styles.signature} />
            <small>Reverse · dark surface</small>
          </div>
        </div>
        <div className={styles.assetStrip}>
          <div className={styles.symbolDisplay}>
            <Image src="/brand/logo-symbol.svg" width={64} height={64} alt="CITIZAVREXO symbol" />
            <span>Symbol</span>
          </div>
          <div className={styles.wordmarkDisplay}>
            <Image src="/brand/wordmark.svg" width={420} height={72} alt="CITIZAVREXO wordmark" />
            <span>Wordmark</span>
          </div>
          <div className={styles.iconScale}>
            <Image src="/icons/favicon-32.png" width={32} height={32} alt="32 pixel application icon" />
            <Image src="/icons/favicon-48.png" width={48} height={48} alt="48 pixel application icon" />
            <Image src="/icons/apple-touch-icon.png" width={80} height={80} alt="Application icon" />
            <span>32 · 48 · 180</span>
          </div>
        </div>
      </section>

      <section className={styles.applicationSection}>
        <div className={styles.sectionLead}>
          <span className={styles.index}>02 / Product contexts</span>
          <div>
            <h2>Designed to earn confidence in use.</h2>
            <p>The identity stays composed across acquisition, access, account management and permanent financial records.</p>
          </div>
        </div>

        <div className={styles.contextLabel}><span>Public navigation</span><span>Desktop · light</span></div>
        <div className={styles.navigationMock}>
          <Logo className={styles.mockLogo} />
          <nav aria-label="Navigation preview"><span>Personal</span><span>Business</span><span>Security</span><span>Company</span></nav>
          <div><button type="button">Sign in</button><button type="button" className={styles.primaryButton}>Open an account <ChevronRight size={16} /></button></div>
        </div>

        <div className={styles.splitContexts}>
          <div>
            <div className={styles.contextLabel}><span>Secure access</span><span>Authentication</span></div>
            <div className={styles.loginMock}>
              <Logo dark className={styles.loginLogo} />
              <div className={styles.loginIntro}>
                <span><ShieldCheck size={16} /> Protected access</span>
                <h3>Your finances,<br />without borders.</h3>
              </div>
              <div className={styles.loginForm}>
                <Fingerprint size={28} />
                <h4>Welcome back</h4>
                <p>Enter your details to continue securely.</p>
                <label>Email address<span>alex.morgan@example.com</span></label>
                <label>Password<span>•••••••••••• <Eye size={15} /></span></label>
                <button type="button">Sign in securely <LockKeyhole size={15} /></button>
              </div>
            </div>
          </div>

          <div>
            <div className={styles.contextLabel}><span>Transaction receipt</span><span>Permanent record</span></div>
            <article className={styles.receiptMock}>
              <header><Logo className={styles.receiptLogo} /><span><Check size={13} /> Successful</span></header>
              <div className={styles.receiptAmount}><small>Recipient received</small><strong>$1,250.00</strong><span>USD</span></div>
              <dl>
                <div><dt>Sender</dt><dd>Alex Morgan<small>Everyday account · ••••4382</small></dd></div>
                <div><dt>Recipient</dt><dd>Amara Okafor<small>Citizavrexo USD · ••••9174</small></dd></div>
                <div><dt>Date</dt><dd>May 24, 2026 · 11:06</dd></div>
                <div><dt>Reference</dt><dd>CZX-0524-9174</dd></div>
              </dl>
              <footer><ReceiptText size={14} /> Verified CITIZAVREXO transaction record</footer>
            </article>
          </div>
        </div>

        <div className={styles.contextLabel}><span>Account workspace</span><span>Responsive dashboard</span></div>
        <div className={styles.dashboardMock}>
          <aside>
            <Logo dark className={styles.dashboardLogo} />
            <nav aria-label="Dashboard preview">
              <span className={styles.activeNav}><LayoutDashboard size={17} /> Overview</span>
              <span><WalletCards size={17} /> Accounts</span>
              <span><Send size={17} /> Transfers</span>
              <span><CreditCard size={17} /> Cards</span>
            </nav>
            <small><ShieldCheck size={14} /> Protected workspace</small>
          </aside>
          <div className={styles.dashboardContent}>
            <header><div><small>OVERVIEW</small><h3>Good morning, Alex.</h3></div><div><Globe2 size={18} /><Bell size={18} /><b>AM</b></div></header>
            <div className={styles.balanceRow}>
              <div className={styles.balancePanel}><span>Available balance</span><strong>$24,860.40</strong><small>USD · Everyday account</small></div>
              <div className={styles.snapshotPanel}><span>Monthly movement</span><strong>+$3,420.18</strong><small>12.4% above last month</small></div>
            </div>
            <div className={styles.transactionPanel}>
              <header><strong>Recent activity</strong><span>View all <ChevronRight size={14} /></span></header>
              {transactions.map(({ icon: Icon, name, date, amount, positive }) => (
                <div className={styles.transaction} key={name}>
                  <span><Icon size={16} /></span><div><b>{name}</b><small>{date}</small></div><strong className={positive ? styles.credit : undefined}>{amount}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.paletteSection}>
        <div className={styles.sectionLead}>
          <span className={styles.index}>03 / Foundation</span>
          <div><h2>Restrained by design.</h2><p>A compact palette balances institutional depth with modern digital clarity.</p></div>
        </div>
        <div className={styles.swatches}>
          <div className={styles.navy}><span>Midnight Navy</span><small>#091C33</small></div>
          <div className={styles.teal}><span>Emerald Teal</span><small>#18C6B1</small></div>
          <div className={styles.gold}><span>Champagne Gold</span><small>#D8B56A</small></div>
          <div className={styles.ivory}><span>Ivory</span><small>#F4F8FB</small></div>
        </div>
      </section>

      <footer className={styles.pageFooter}>
        <Logo dark className={styles.footerLogo} />
        <span>Premium financial technology · Identity review</span>
      </footer>
    </main>
  );
}