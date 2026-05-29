"""
TheOmniStack Ticket-System
Multi-Tenant Support mit Rollen-basiertem Zugriff
"""

import os
import sqlite3
import hashlib
import secrets
import json
import urllib.request
import urllib.error
from datetime import datetime
from functools import wraps
from flask import (
    Flask, render_template, request, redirect,
    url_for, session, flash, jsonify, send_from_directory
)
from werkzeug.utils import secure_filename
import jwt as pyjwt

# ---------------------------------------------------------------------------
# Konfiguration
# ---------------------------------------------------------------------------
app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(32))

ADMIN_USERNAME = os.environ.get('ADMIN_USER', 'admin')
ADMIN_PASSWORD_HASH = os.environ.get(
    'ADMIN_PASS_HASH',
    hashlib.sha256('admin123'.encode()).hexdigest()
)

UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'static', 'uploads')
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
MAX_CONTENT_LENGTH = 5 * 1024 * 1024  # 5 MB

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

DATABASE = os.path.join(os.path.dirname(__file__), 'tickets.db')

KATEGORIEN = ['TheOmniStack', 'Ticket System']

RESEND_API_KEY = os.environ.get('RESEND_API_KEY', '')
TICKET_BASE_URL = os.environ.get('TICKET_BASE_URL', 'https://tickets.theomnistack.de')

# ---------------------------------------------------------------------------
# Datenbank
# ---------------------------------------------------------------------------
def get_db():
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_db() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'haendler',
                erstellt_am TEXT NOT NULL
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS tickets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                titel TEXT NOT NULL,
                beschreibung TEXT NOT NULL,
                kategorie TEXT NOT NULL DEFAULT 'TheOmniStack',
                prioritaet TEXT NOT NULL DEFAULT 'Mittel',
                status TEXT NOT NULL DEFAULT 'Offen',
                screenshot TEXT,
                erstellt_am TEXT NOT NULL,
                geaendert_am TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        ''')
        conn.execute('''
            CREATE TABLE IF NOT EXISTS nachrichten (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id INTEGER NOT NULL,
                absender_id INTEGER,
                typ TEXT NOT NULL DEFAULT 'info_anfrage',
                nachricht TEXT NOT NULL,
                erstellt_am TEXT NOT NULL,
                FOREIGN KEY (ticket_id) REFERENCES tickets(id),
                FOREIGN KEY (absender_id) REFERENCES users(id)
            )
        ''')
        # Migrationen: fehlende Spalten ergänzen
        for migration in [
            'ALTER TABLE tickets ADD COLUMN user_id INTEGER',
            "ALTER TABLE tickets ADD COLUMN kategorie TEXT NOT NULL DEFAULT 'TheOmniStack'",
            'ALTER TABLE nachrichten ADD COLUMN gelesen INTEGER DEFAULT 0',
        ]:
            try:
                conn.execute(migration)
            except Exception:
                pass
        conn.commit()

# ---------------------------------------------------------------------------
# Hilfsfunktionen
# ---------------------------------------------------------------------------
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def jetzt():
    return datetime.now().strftime('%d.%m.%Y %H:%M')

def get_current_user():
    if session.get('user_id'):
        with get_db() as conn:
            return conn.execute('SELECT * FROM users WHERE id = ?', (session['user_id'],)).fetchone()
    return None

# ---------------------------------------------------------------------------
# E-Mail-Versand via Resend API
# ---------------------------------------------------------------------------
def send_email(to: str, subject: str, html: str) -> bool:
    """Sendet eine E-Mail via Resend API. Gibt True bei Erfolg zurück."""
    if not RESEND_API_KEY:
        app.logger.warning('RESEND_API_KEY nicht gesetzt – E-Mail wird nicht versendet.')
        return False

    payload = json.dumps({
        'from': 'TheOmniStack Support <support@theomnistack.de>',
        'to': [to],
        'subject': subject,
        'html': html,
    }).encode('utf-8')

    req = urllib.request.Request(
        'https://api.resend.com/emails',
        data=payload,
        headers={
            'Authorization': f'Bearer {RESEND_API_KEY}',
            'Content-Type': 'application/json',
            'User-Agent': 'TheOmniStack-Ticketsystem/1.0',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status in (200, 201)
    except urllib.error.HTTPError as e:
        app.logger.error(f'Resend API Fehler {e.code}: {e.read().decode()}')
        return False
    except Exception as e:
        app.logger.error(f'E-Mail-Versand fehlgeschlagen: {e}')
        return False

def get_support_emails() -> list[str]:
    """Gibt alle gültigen E-Mail-Adressen von Support- und Admin-Nutzern zurück."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT email FROM users WHERE role IN ('support', 'admin')"
        ).fetchall()
    # Nur gültige E-Mail-Adressen (mit @) zurückgeben
    return [row['email'] for row in rows if '@' in (row['email'] or '')]

def email_ticket_bestaetigung(haendler_email: str, haendler_name: str, ticket_id: int, titel: str):
    """Bestätigungs-E-Mail an Ticket-Ersteller (Händler)."""
    ticket_url = f"{TICKET_BASE_URL}/ticket/{ticket_id}"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:24px;border-radius:12px">
      <div style="text-align:center;margin-bottom:24px">
        <img src="https://app.theomnistack.de/apple-icon.png" width="56" height="56"
             style="border-radius:12px" alt="TheOmniStack" />
      </div>
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:28px">
        <h2 style="color:#111827;margin:0 0 16px">Ihr Ticket wurde erstellt ✅</h2>
        <p style="color:#374151;font-size:15px">Hallo {haendler_name},</p>
        <p style="color:#374151;font-size:15px">
          Ihr Support-Ticket wurde erfolgreich eingereicht. Unser Team wird sich so schnell wie
          möglich darum kümmern.
        </p>
        <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:20px 0">
          <p style="margin:0;color:#6b7280;font-size:13px">TICKET-NR.</p>
          <p style="margin:4px 0 0;color:#111827;font-size:18px;font-weight:700">#{ticket_id}</p>
          <p style="margin:8px 0 0;color:#6b7280;font-size:13px">BETREFF</p>
          <p style="margin:4px 0 0;color:#111827;font-size:15px">{titel}</p>
        </div>
        <a href="{ticket_url}"
           style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;
                  border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          Ticket ansehen →
        </a>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
        <p style="color:#9ca3af;font-size:12px;margin:0">
          TheOmniStack Support · <a href="https://tickets.theomnistack.de" style="color:#9ca3af">tickets.theomnistack.de</a>
        </p>
      </div>
    </div>
    """
    send_email(haendler_email, f'Ticket #{ticket_id} bestätigt: {titel}', html)

def email_ticket_neues_support(support_emails: list[str], haendler_name: str,
                                ticket_id: int, titel: str, beschreibung: str, prioritaet: str):
    """Benachrichtigung an alle Support-Mitarbeiter bei neuem Ticket."""
    ticket_url = f"{TICKET_BASE_URL}/ticket/{ticket_id}"
    prioritaet_farbe = {'Hoch': '#dc2626', 'Mittel': '#d97706', 'Niedrig': '#16a34a'}.get(prioritaet, '#6b7280')
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:24px;border-radius:12px">
      <div style="text-align:center;margin-bottom:24px">
        <img src="https://app.theomnistack.de/apple-icon.png" width="56" height="56"
             style="border-radius:12px" alt="TheOmniStack" />
      </div>
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:28px">
        <h2 style="color:#111827;margin:0 0 16px">🎫 Neues Support-Ticket eingegangen</h2>
        <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:20px 0">
          <p style="margin:0;color:#6b7280;font-size:13px">TICKET-NR. &amp; HÄNDLER</p>
          <p style="margin:4px 0 0;color:#111827;font-size:16px;font-weight:700">
            #{ticket_id} · {haendler_name}
          </p>
          <p style="margin:8px 0 0;color:#6b7280;font-size:13px">BETREFF</p>
          <p style="margin:4px 0 0;color:#111827;font-size:15px">{titel}</p>
          <p style="margin:8px 0 0;color:#6b7280;font-size:13px">PRIORITÄT</p>
          <p style="margin:4px 0 0;color:{prioritaet_farbe};font-size:15px;font-weight:600">{prioritaet}</p>
          <p style="margin:8px 0 0;color:#6b7280;font-size:13px">BESCHREIBUNG</p>
          <p style="margin:4px 0 0;color:#374151;font-size:14px;white-space:pre-wrap">{beschreibung[:500]}{'...' if len(beschreibung) > 500 else ''}</p>
        </div>
        <a href="{ticket_url}"
           style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;
                  border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          Ticket öffnen →
        </a>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
        <p style="color:#9ca3af;font-size:12px;margin:0">TheOmniStack Support-System</p>
      </div>
    </div>
    """
    for email in support_emails:
        send_email(email, f'[Neues Ticket #{ticket_id}] {titel} – {prioritaet}', html)

def email_ticket_geschlossen(haendler_email: str, haendler_name: str, ticket_id: int, titel: str, abschluss_text: str = None):
    """E-Mail an Händler wenn Ticket geschlossen wird."""
    ticket_url = f"{TICKET_BASE_URL}/ticket/{ticket_id}"
    
    abschluss_html = ""
    if abschluss_text:
        abschluss_html = f"""
        <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:8px;padding:16px;margin:20px 0">
          <p style="margin:0;color:#065f46;font-size:13px;font-weight:600">KOMMENTAR VOM SUPPORT</p>
          <p style="margin:8px 0 0;color:#047857;font-size:15px;white-space:pre-wrap">{abschluss_text}</p>
        </div>
        """

    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:24px;border-radius:12px">
      <div style="text-align:center;margin-bottom:24px">
        <img src="https://app.theomnistack.de/apple-icon.png" width="56" height="56"
             style="border-radius:12px" alt="TheOmniStack" />
      </div>
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:28px">
        <h2 style="color:#111827;margin:0 0 16px">Ihr Ticket wurde geschlossen ✔️</h2>
        <p style="color:#374151;font-size:15px">Hallo {haendler_name},</p>
        <p style="color:#374151;font-size:15px">
          Ihr Support-Ticket wurde von unserem Team als <strong>erledigt</strong> markiert.
          Wir hoffen, dass Ihr Anliegen zufriedenstellend gelöst wurde.
        </p>
        {abschluss_html}
        <div style="background:#f3f4f6;border-radius:8px;padding:16px;margin:20px 0">
          <p style="margin:0;color:#6b7280;font-size:13px">TICKET-NR.</p>
          <p style="margin:4px 0 0;color:#111827;font-size:18px;font-weight:700">#{ticket_id}</p>
          <p style="margin:8px 0 0;color:#6b7280;font-size:13px">BETREFF</p>
          <p style="margin:4px 0 0;color:#111827;font-size:15px">{titel}</p>
        </div>
        <p style="color:#374151;font-size:14px">
          Falls das Problem weiterhin besteht oder Sie weitere Fragen haben,
          können Sie das Ticket direkt wiedereröffnen.
        </p>
        <a href="{ticket_url}"
           style="display:inline-block;background:#2563eb;color:#fff;padding:12px 24px;
                  border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;margin-right:12px">
          Ticket ansehen &amp; wiedereröffnen →
        </a>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
        <p style="color:#9ca3af;font-size:12px;margin:0">
          TheOmniStack Support · <a href="https://tickets.theomnistack.de" style="color:#9ca3af">tickets.theomnistack.de</a>
        </p>
      </div>
    </div>
    """
    send_email(haendler_email, f'Ticket #{ticket_id} wurde geschlossen: {titel}', html)

def email_ticket_wiedereroeffnet_support(support_emails: list[str], haendler_name: str,
                                         ticket_id: int, titel: str):
    """Benachrichtigung an Support-Team wenn Händler ein geschlossenes Ticket wiedereröffnet."""
    ticket_url = f"{TICKET_BASE_URL}/ticket/{ticket_id}"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:24px;border-radius:12px">
      <div style="text-align:center;margin-bottom:24px">
        <img src="https://app.theomnistack.de/apple-icon.png" width="56" height="56"
             style="border-radius:12px" alt="TheOmniStack" />
      </div>
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:28px">
        <h2 style="color:#111827;margin:0 0 16px">🔄 Ticket wurde wiedereröffnet</h2>
        <p style="color:#374151;font-size:15px">
          <strong>{haendler_name}</strong> hat ein geschlossenes Ticket wiedereröffnet.
        </p>
        <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:20px 0">
          <p style="margin:0;color:#92400e;font-size:13px;font-weight:600">TICKET-NR. &amp; BETREFF</p>
          <p style="margin:4px 0 0;color:#78350f;font-size:16px;font-weight:700">#{ticket_id} · {titel}</p>
        </div>
        <a href="{ticket_url}"
           style="display:inline-block;background:#d97706;color:#fff;padding:12px 24px;
                  border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          Ticket öffnen →
        </a>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
        <p style="color:#9ca3af;font-size:12px;margin:0">TheOmniStack Support-System</p>
      </div>
    </div>
    """
    for email in support_emails:
        send_email(email, f'[Wiedereröffnet #{ticket_id}] {titel} – {haendler_name}', html)

def email_info_anfrage(haendler_email: str, haendler_name: str,
                        ticket_id: int, titel: str, nachricht: str, support_name: str):
    """E-Mail an Händler wenn Support weitere Informationen anfordert."""
    ticket_url = f"{TICKET_BASE_URL}/ticket/{ticket_id}"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:24px;border-radius:12px">
      <div style="text-align:center;margin-bottom:24px">
        <img src="https://app.theomnistack.de/apple-icon.png" width="56" height="56"
             style="border-radius:12px" alt="TheOmniStack" />
      </div>
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:28px">
        <h2 style="color:#111827;margin:0 0 16px">💬 Weitere Informationen benötigt</h2>
        <p style="color:#374151;font-size:15px">Hallo {haendler_name},</p>
        <p style="color:#374151;font-size:15px">
          Unser Support-Mitarbeiter <strong>{support_name}</strong> benötigt weitere Informationen
          zu Ihrem Ticket <strong>#{ticket_id}</strong>.
        </p>
        <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:20px 0">
          <p style="margin:0;color:#92400e;font-size:13px;font-weight:600">ANFRAGE</p>
          <p style="margin:8px 0 0;color:#78350f;font-size:15px;white-space:pre-wrap">{nachricht}</p>
        </div>
        <div style="background:#f3f4f6;border-radius:8px;padding:12px;margin-bottom:20px">
          <p style="margin:0;color:#6b7280;font-size:13px">TICKET</p>
          <p style="margin:4px 0 0;color:#111827;font-size:14px">#{ticket_id} · {titel}</p>
        </div>
        <a href="{ticket_url}"
           style="display:inline-block;background:#d97706;color:#fff;padding:12px 24px;
                  border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          Zum Ticket antworten →
        </a>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
        <p style="color:#9ca3af;font-size:12px;margin:0">
          TheOmniStack Support · <a href="https://tickets.theomnistack.de" style="color:#9ca3af">tickets.theomnistack.de</a>
        </p>
      </div>
    </div>
    """
    send_email(haendler_email, f'[Ticket #{ticket_id}] Weitere Informationen benötigt: {titel}', html)

def email_haendler_antwort_support(support_emails: list[str], haendler_name: str,
                                    ticket_id: int, titel: str, nachricht: str):
    """Benachrichtigung an Support wenn Händler auf Info-Anfrage antwortet."""
    ticket_url = f"{TICKET_BASE_URL}/ticket/{ticket_id}"
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f9fafb;padding:24px;border-radius:12px">
      <div style="text-align:center;margin-bottom:24px">
        <img src="https://app.theomnistack.de/apple-icon.png" width="56" height="56"
             style="border-radius:12px" alt="TheOmniStack" />
      </div>
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:28px">
        <h2 style="color:#111827;margin:0 0 16px">&#128172; Händler hat geantwortet</h2>
        <p style="color:#374151;font-size:15px">
          <strong>{haendler_name}</strong> hat auf Ihre Informationsanfrage zu Ticket <strong>#{ticket_id}</strong> geantwortet.
        </p>
        <div style="background:#dcfce7;border:1px solid #86efac;border-radius:8px;padding:16px;margin:20px 0">
          <p style="margin:0;color:#14532d;font-size:13px;font-weight:600">ANTWORT DES HÄNDLERS</p>
          <p style="margin:8px 0 0;color:#166534;font-size:15px;white-space:pre-wrap">{nachricht}</p>
        </div>
        <div style="background:#f3f4f6;border-radius:8px;padding:12px;margin-bottom:20px">
          <p style="margin:0;color:#6b7280;font-size:13px">TICKET</p>
          <p style="margin:4px 0 0;color:#111827;font-size:14px">#{ticket_id} · {titel}</p>
        </div>
        <a href="{ticket_url}"
           style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;
                  border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">
          Ticket öffnen &#8594;
        </a>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0" />
        <p style="color:#9ca3af;font-size:12px;margin:0">TheOmniStack Support-System</p>
      </div>
    </div>
    """
    for email in support_emails:
        send_email(email, f'[Antwort Ticket #{ticket_id}] {haendler_name} hat geantwortet', html)

# ---------------------------------------------------------------------------
# Login-Schutz (Decorators)
# ---------------------------------------------------------------------------
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('logged_in'):
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not session.get('logged_in'):
            return redirect(url_for('login'))
        if session.get('role') != 'admin':
            flash('Keine Berechtigung.', 'error')
            return redirect(url_for('dashboard'))
        return f(*args, **kwargs)
    return decorated

# ---------------------------------------------------------------------------
# SSO (Auto-Login von TheOmniStack)
# ---------------------------------------------------------------------------
@app.route('/sso')
def sso():
    token = request.args.get('token', '')
    sso_secret = os.environ.get('SSO_SECRET', '')
    if not token or not sso_secret:
        return redirect(url_for('login'))
    try:
        payload = pyjwt.decode(token, sso_secret, algorithms=['HS256'])
        email = payload.get('email') or payload.get('username') or ''
        name = payload.get('name') or email
        omnistack_role = payload.get('role', 'staff')

        if not email:
            return redirect(url_for('login'))

        # Neue SSO-Benutzer starten standardmäßig immer als Händler (haendler).
        # Die Zuweisung von Admin- oder Support-Rollen erfolgt ausschließlich
        # manuell durch einen Administrator des Ticket-Systems.
        default_role = 'haendler'

        with get_db() as conn:
            user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
            if not user:
                conn.execute(
                    'INSERT INTO users (email, name, role, erstellt_am) VALUES (?, ?, ?, ?)',
                    (email, name, default_role, jetzt())
                )
                conn.commit()
                user = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
            else:
                # Name aktualisieren, aber Rolle beibehalten (Admins können Rollen manuell setzen)
                conn.execute('UPDATE users SET name = ? WHERE email = ?', (name, email))
                conn.commit()

        session.permanent = False
        session['logged_in'] = True
        session['user_id'] = user['id']
        session['username'] = email
        session['role'] = user['role']

        return redirect(url_for('dashboard'))
    except pyjwt.ExpiredSignatureError:
        flash('SSO-Token abgelaufen. Bitte erneut anmelden.', 'error')
        return redirect(url_for('login'))
    except Exception:
        return redirect(url_for('login'))

# ---------------------------------------------------------------------------
# Routen: Auth
# ---------------------------------------------------------------------------
@app.route('/login', methods=['GET', 'POST'])
def login():
    if session.get('logged_in'):
        return redirect(url_for('dashboard'))

    error = None
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')
        pw_hash  = hashlib.sha256(password.encode()).hexdigest()

        if username == ADMIN_USERNAME and pw_hash == ADMIN_PASSWORD_HASH:
            with get_db() as conn:
                user = conn.execute('SELECT * FROM users WHERE email = ?', (username,)).fetchone()
                if not user:
                    conn.execute(
                        'INSERT INTO users (email, name, role, erstellt_am) VALUES (?, ?, ?, ?)',
                        (username, 'Administrator', 'admin', jetzt())
                    )
                    conn.commit()
                    user = conn.execute('SELECT * FROM users WHERE email = ?', (username,)).fetchone()

            session.permanent = False
            session['logged_in'] = True
            session['user_id'] = user['id']
            session['username'] = username
            session['role'] = 'admin'
            return redirect(url_for('dashboard'))
        else:
            error = 'Benutzername oder Passwort falsch.'

    return render_template('login.html', error=error)

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

# ---------------------------------------------------------------------------
# Routen: Dashboard
# ---------------------------------------------------------------------------
@app.route('/')
@login_required
def dashboard():
    status_filter     = request.args.get('status', 'alle')
    prioritaet_filter = request.args.get('prioritaet', 'alle')
    kategorie_filter  = request.args.get('kategorie', 'alle')
    suche             = request.args.get('suche', '').strip()

    user_role = session.get('role', 'haendler')
    user_id   = session.get('user_id')

    query  = '''SELECT t.*, u.name as user_name, u.email as user_email
                FROM tickets t LEFT JOIN users u ON t.user_id = u.id
                WHERE 1=1'''
    params = []

    # Händler sehen nur eigene Tickets
    if user_role == 'haendler':
        query += ' AND t.user_id = ?'
        params.append(user_id)

    if status_filter != 'alle':
        query += ' AND t.status = ?'
        params.append(status_filter)

    if prioritaet_filter != 'alle':
        query += ' AND t.prioritaet = ?'
        params.append(prioritaet_filter)

    if kategorie_filter != 'alle':
        query += ' AND t.kategorie = ?'
        params.append(kategorie_filter)

    if suche:
        query += ' AND (t.titel LIKE ? OR t.beschreibung LIKE ?)'
        params.extend([f'%{suche}%', f'%{suche}%'])

    query += ' ORDER BY t.erstellt_am DESC'

    with get_db() as conn:
        tickets = conn.execute(query, params).fetchall()

        # Stats berechnen (gefiltert nach Benutzer falls Haendler)
        stats_query = 'SELECT status FROM tickets WHERE 1=1'
        stats_params = []
        if user_role == "haendler":
            stats_query += ' AND user_id = ?'
            stats_params.append(user_id)
        alle_tickets = conn.execute(stats_query, stats_params).fetchall()

    stats = {
        'gesamt': len(alle_tickets),
        'offen': sum(1 for t in alle_tickets if t[0] == 'Offen'),
        'in_bearbeitung': sum(1 for t in alle_tickets if t[0] == 'In Bearbeitung'),
        'erledigt': sum(1 for t in alle_tickets if t[0] == 'Erledigt'),
    }

    # IDs von Tickets mit ungelesenen Händler-Antworten (nur für Support/Admin)
    neue_antworten = set()
    if user_role in ('support', 'admin'):
        with get_db() as conn:
            rows = conn.execute(
                "SELECT DISTINCT ticket_id FROM nachrichten WHERE typ='haendler_antwort' AND gelesen=0"
            ).fetchall()
            neue_antworten = {r['ticket_id'] for r in rows}

    return render_template('dashboard.html',
                           tickets=tickets,
                           stats=stats,
                           neue_antworten=neue_antworten,
                           status_filter=status_filter,
                           prioritaet_filter=prioritaet_filter,
                           kategorie_filter=kategorie_filter,
                           suche=suche,
                           user_role=user_role,
                           kategorien=KATEGORIEN)

# ---------------------------------------------------------------------------
# Routen: Neues Ticket
# ---------------------------------------------------------------------------
@app.route('/neu', methods=['GET', 'POST'])
@login_required
def neu():
    user_id = session.get('user_id')
    if request.method == 'POST':
        titel        = request.form.get('titel', '').strip()
        beschreibung = request.form.get('beschreibung', '').strip()
        prioritaet   = request.form.get('prioritaet', 'Mittel')
        kategorie    = request.form.get('kategorie', 'TheOmniStack')
        screenshot   = None

        if not titel or not beschreibung:
            flash('Titel und Beschreibung sind Pflichtfelder.', 'error')
            return render_template('neu.html', titel=titel, beschreibung=beschreibung,
                                   prioritaet=prioritaet, kategorie=kategorie, kategorien=KATEGORIEN)

        if 'screenshot' in request.files:
            file = request.files['screenshot']
            if file and file.filename and allowed_file(file.filename):
                filename = secrets.token_hex(8) + '_' + secure_filename(file.filename)
                file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                screenshot = filename

        jetzt_str = jetzt()
        with get_db() as conn:
            conn.execute('''
                INSERT INTO tickets
                    (user_id, titel, beschreibung, kategorie, prioritaet, status, screenshot, erstellt_am, geaendert_am)
                VALUES (?, ?, ?, ?, ?, 'Offen', ?, ?, ?)
            ''', (user_id, titel, beschreibung, kategorie, prioritaet, screenshot, jetzt_str, jetzt_str))
            conn.commit()
            ticket_id = conn.execute('SELECT last_insert_rowid()').fetchone()[0]

            # Händler-Daten für E-Mail holen
            haendler = conn.execute('SELECT email, name FROM users WHERE id = ?', (user_id,)).fetchone()

        # E-Mails asynchron senden (im gleichen Thread, aber nach der DB-Operation)
        if haendler:
            email_ticket_bestaetigung(haendler['email'], haendler['name'], ticket_id, titel)

        support_emails = get_support_emails()
        haendler_name = haendler['name'] if haendler else 'Unbekannt'
        email_ticket_neues_support(support_emails, haendler_name, ticket_id, titel, beschreibung, prioritaet)

        flash(f'Ticket „{titel}" wurde erstellt.', 'success')
        return redirect(url_for('dashboard'))

    return render_template('neu.html', kategorien=KATEGORIEN)

# ---------------------------------------------------------------------------
# Routen: Ticket-Detail
# ---------------------------------------------------------------------------
@app.route('/ticket/<int:ticket_id>')
@login_required
def detail(ticket_id):
    user_id   = session.get('user_id')
    user_role = session.get('role', 'haendler')

    with get_db() as conn:
        ticket = conn.execute('''
            SELECT t.*, u.name as user_name, u.email as user_email
            FROM tickets t LEFT JOIN users u ON t.user_id = u.id
            WHERE t.id = ?
        ''', (ticket_id,)).fetchone()

        nachrichten = conn.execute('''
            SELECT n.*, u.name as absender_name, u.role as absender_rolle
            FROM nachrichten n LEFT JOIN users u ON n.absender_id = u.id
            WHERE n.ticket_id = ?
            ORDER BY n.erstellt_am ASC
        ''', (ticket_id,)).fetchall()

    if not ticket:
        flash('Ticket nicht gefunden.', 'error')
        return redirect(url_for('dashboard'))

    # Händler dürfen nur eigene Tickets sehen
    if user_role == 'haendler' and ticket['user_id'] != user_id:
        flash('Keine Berechtigung.', 'error')
        return redirect(url_for('dashboard'))

    # Support/Admin: Händler-Antworten als gelesen markieren beim Öffnen
    if user_role in ('support', 'admin'):
        with get_db() as conn:
            conn.execute(
                "UPDATE nachrichten SET gelesen=1 WHERE ticket_id=? AND typ='haendler_antwort'",
                (ticket_id,)
            )
            conn.commit()

    return render_template('detail.html', ticket=ticket, user_role=user_role, nachrichten=nachrichten)

# ---------------------------------------------------------------------------
# API: Informationsanfrage senden
# ---------------------------------------------------------------------------
@app.route('/api/ticket/<int:ticket_id>/info-anfrage', methods=['POST'])
@login_required
def info_anfrage(ticket_id):
    user_role = session.get('role', 'haendler')
    # Nur Support/Admin dürfen Info-Anfragen senden
    if user_role == 'haendler':
        return jsonify({'error': 'Keine Berechtigung'}), 403

    data = request.get_json()
    nachricht = (data.get('nachricht') or '').strip()
    if not nachricht:
        return jsonify({'error': 'Nachricht darf nicht leer sein'}), 400

    absender_id = session.get('user_id')
    jetzt_str = jetzt()

    with get_db() as conn:
        ticket = conn.execute('''
            SELECT t.*, u.email as user_email, u.name as user_name
            FROM tickets t LEFT JOIN users u ON t.user_id = u.id
            WHERE t.id = ?
        ''', (ticket_id,)).fetchone()

        if not ticket:
            return jsonify({'error': 'Ticket nicht gefunden'}), 404

        conn.execute('''
            INSERT INTO nachrichten (ticket_id, absender_id, typ, nachricht, erstellt_am)
            VALUES (?, ?, 'info_anfrage', ?, ?)
        ''', (ticket_id, absender_id, nachricht, jetzt_str))
        conn.commit()

        absender = conn.execute('SELECT name FROM users WHERE id = ?', (absender_id,)).fetchone()

    # E-Mail an Händler senden
    if ticket['user_email']:
        email_info_anfrage(
            haendler_email=ticket['user_email'],
            haendler_name=ticket['user_name'] or 'Händler',
            ticket_id=ticket_id,
            titel=ticket['titel'],
            nachricht=nachricht,
            support_name=absender['name'] if absender else 'Support-Mitarbeiter',
        )

    return jsonify({'success': True, 'erstellt_am': jetzt_str})

# ---------------------------------------------------------------------------
# API: Händler antwortet auf Info-Anfrage
# ---------------------------------------------------------------------------
@app.route('/api/ticket/<int:ticket_id>/antwort', methods=['POST'])
@login_required
def haendler_antwort(ticket_id):
    user_id   = session.get('user_id')
    user_role = session.get('role', 'haendler')

    data = request.get_json()
    nachricht = (data.get('nachricht') or '').strip()
    if not nachricht:
        return jsonify({'error': 'Nachricht darf nicht leer sein'}), 400

    jetzt_str = jetzt()

    with get_db() as conn:
        ticket = conn.execute('''
            SELECT t.*, u.name as user_name
            FROM tickets t LEFT JOIN users u ON t.user_id = u.id
            WHERE t.id = ?
        ''', (ticket_id,)).fetchone()

        if not ticket:
            return jsonify({'error': 'Ticket nicht gefunden'}), 404

        # Händler dürfen nur auf eigene Tickets antworten
        if user_role == 'haendler' and ticket['user_id'] != user_id:
            return jsonify({'error': 'Keine Berechtigung'}), 403

        conn.execute('''
            INSERT INTO nachrichten (ticket_id, absender_id, typ, nachricht, erstellt_am, gelesen)
            VALUES (?, ?, 'haendler_antwort', ?, ?, 0)
        ''', (ticket_id, user_id, nachricht, jetzt_str))
        conn.commit()

        absender = conn.execute('SELECT name FROM users WHERE id = ?', (user_id,)).fetchone()

    # Support per E-Mail benachrichtigen
    support_emails = get_support_emails()
    haendler_name = absender['name'] if absender else 'Händler'
    email_haendler_antwort_support(support_emails, haendler_name, ticket_id, ticket['titel'], nachricht)

    return jsonify({'success': True, 'erstellt_am': jetzt_str, 'absender_name': haendler_name})

# ---------------------------------------------------------------------------
# API: Händler eröffnet geschlossenes Ticket wieder
# ---------------------------------------------------------------------------
@app.route('/api/ticket/<int:ticket_id>/reopen', methods=['POST'])
@login_required
def reopen_ticket(ticket_id):
    user_id   = session.get('user_id')
    user_role = session.get('role', 'haendler')

    with get_db() as conn:
        ticket = conn.execute('''
            SELECT t.*, u.name as user_name, u.email as user_email
            FROM tickets t LEFT JOIN users u ON t.user_id = u.id
            WHERE t.id = ?
        ''', (ticket_id,)).fetchone()

        if not ticket:
            return jsonify({'error': 'Ticket nicht gefunden'}), 404

        # Händler dürfen nur eigene Tickets wiedereröffnen
        if user_role == 'haendler' and ticket['user_id'] != user_id:
            return jsonify({'error': 'Keine Berechtigung'}), 403

        # Nur geschlossene Tickets können wiedereröffnet werden
        if ticket['status'] != 'Erledigt':
            return jsonify({'error': 'Ticket ist nicht geschlossen'}), 400

        jetzt_str = jetzt()

        # Status zurücksetzen auf Offen
        conn.execute(
            'UPDATE tickets SET status=?, geaendert_am=? WHERE id=?',
            ('Offen', jetzt_str, ticket_id)
        )

        # Wiedereröffnung als Nachricht im Ticket protokollieren
        # (nutzt Typ haendler_antwort damit das Support-Dashboard das Badge anzeigt)
        conn.execute('''
            INSERT INTO nachrichten (ticket_id, absender_id, typ, nachricht, erstellt_am, gelesen)
            VALUES (?, ?, 'haendler_antwort', ?, ?, 0)
        ''', (ticket_id, user_id, '🔄 Das Ticket wurde vom Händler wiedereröffnet.', jetzt_str))
        conn.commit()

        absender = conn.execute('SELECT name FROM users WHERE id = ?', (user_id,)).fetchone()

    # Support per E-Mail benachrichtigen
    support_emails = get_support_emails()
    haendler_name = absender['name'] if absender else 'Händler'
    email_ticket_wiedereroeffnet_support(support_emails, haendler_name, ticket_id, ticket['titel'])

    return jsonify({'success': True})

# ---------------------------------------------------------------------------
# Admin: Benutzerverwaltung
# ---------------------------------------------------------------------------
@app.route('/admin/users')
@admin_required
def admin_users():
    with get_db() as conn:
        users = conn.execute('SELECT * FROM users ORDER BY erstellt_am DESC').fetchall()
    return render_template('admin_users.html', users=users)

@app.route('/admin/users/invite', methods=['POST'])
@admin_required
def invite_user():
    email = request.form.get('email', '').strip().lower()
    name = request.form.get('name', '').strip()
    role = request.form.get('role', 'haendler')

    if not email or not name:
        flash('Name und E-Mail sind Pflichtfelder.', 'error')
        return redirect(url_for('admin_users'))

    if role not in ('admin', 'support', 'haendler'):
        flash('Ungültige Rolle.', 'error')
        return redirect(url_for('admin_users'))

    with get_db() as conn:
        existing = conn.execute('SELECT * FROM users WHERE email = ?', (email,)).fetchone()
        if existing:
            flash('Ein Benutzer mit dieser E-Mail existiert bereits.', 'error')
            return redirect(url_for('admin_users'))

        conn.execute(
            'INSERT INTO users (email, name, role, erstellt_am) VALUES (?, ?, ?, ?)',
            (email, name, role, jetzt())
        )
        conn.commit()

    flash(f'Benutzer {name} ({email}) wurde erfolgreich angelegt.', 'success')
    return redirect(url_for('admin_users'))

@app.route('/admin/users/<int:user_id>/delete', methods=['POST'])
@admin_required
def delete_user(user_id):
    if user_id == session.get('user_id'):
        flash('Du kannst dein eigenes Konto nicht löschen.', 'error')
        return redirect(url_for('admin_users'))

    with get_db() as conn:
        user = conn.execute('SELECT * FROM users WHERE id = ?', (user_id,)).fetchone()
        if not user:
            flash('Benutzer nicht gefunden.', 'error')
            return redirect(url_for('admin_users'))

        conn.execute('DELETE FROM users WHERE id = ?', (user_id,))
        conn.commit()

    flash(f'Benutzer {user["name"]} wurde entfernt.', 'success')
    return redirect(url_for('admin_users'))

@app.route('/admin/users/<int:user_id>/role', methods=['POST'])
@admin_required
def update_user_role(user_id):
    new_role = request.form.get('role')
    if new_role not in ('admin', 'support', 'haendler'):
        flash('Ungültige Rolle.', 'error')
        return redirect(url_for('admin_users'))
    with get_db() as conn:
        conn.execute('UPDATE users SET role = ? WHERE id = ?', (new_role, user_id))
        conn.commit()
    flash('Rolle wurde aktualisiert.', 'success')
    return redirect(url_for('admin_users'))

# ---------------------------------------------------------------------------
# API: Status ändern (AJAX)
# ---------------------------------------------------------------------------
@app.route('/api/ticket/<int:ticket_id>/status', methods=['POST'])
@login_required
def update_status(ticket_id):
    user_role = session.get('role', 'haendler')
    # Nur Support/Admin dürfen Status ändern
    if user_role == 'haendler':
        return jsonify({'error': 'Keine Berechtigung'}), 403

    data   = request.get_json()
    status = data.get('status')
    nachricht = data.get('nachricht')  # Optionaler Schließungskommentar
    if status not in ['Offen', 'In Bearbeitung', 'Erledigt']:
        return jsonify({'error': 'Ungültiger Status'}), 400

    absender_id = session.get('user_id')
    jetzt_str = jetzt()

    with get_db() as conn:
        ticket = conn.execute('''
            SELECT t.*, u.email as user_email, u.name as user_name
            FROM tickets t LEFT JOIN users u ON t.user_id = u.id
            WHERE t.id = ?
        ''', (ticket_id,)).fetchone()

        if not ticket:
            return jsonify({'error': 'Ticket nicht gefunden'}), 404

        conn.execute('UPDATE tickets SET status=?, geaendert_am=? WHERE id=?',
                     (status, jetzt_str, ticket_id))

        # Wenn Status auf Erledigt gesetzt wird und ein Kommentar vorhanden ist, diesen als Nachricht einpflegen
        if status == 'Erledigt' and nachricht and nachricht.strip():
            conn.execute('''
                INSERT INTO nachrichten (ticket_id, absender_id, typ, nachricht, erstellt_am, gelesen)
                VALUES (?, ?, 'info_anfrage', ?, ?, 1)
            ''', (ticket_id, absender_id, nachricht.strip(), jetzt_str))

        conn.commit()

    # E-Mail an Händler wenn Ticket geschlossen wird
    if status == 'Erledigt' and ticket['user_email']:
        email_ticket_geschlossen(
            haendler_email=ticket['user_email'],
            haendler_name=ticket['user_name'] or 'Händler',
            ticket_id=ticket_id,
            titel=ticket['titel'],
            abschluss_text=nachricht.strip() if (nachricht and nachricht.strip()) else None
        )

    return jsonify({'success': True, 'status': status})

# ---------------------------------------------------------------------------
# API: Ticket löschen (AJAX)
# ---------------------------------------------------------------------------
@app.route('/api/ticket/<int:ticket_id>', methods=['DELETE'])
@login_required
def delete_ticket(ticket_id):
    user_id   = session.get('user_id')
    user_role = session.get('role', 'haendler')

    with get_db() as conn:
        ticket = conn.execute('SELECT screenshot, user_id FROM tickets WHERE id=?', (ticket_id,)).fetchone()
        if not ticket:
            return jsonify({'error': 'Nicht gefunden'}), 404

        # Händler dürfen nur eigene Tickets löschen
        if user_role == 'haendler' and ticket['user_id'] != user_id:
            return jsonify({'error': 'Keine Berechtigung'}), 403

        if ticket['screenshot']:
            try:
                os.remove(os.path.join(app.config['UPLOAD_FOLDER'], ticket['screenshot']))
            except FileNotFoundError:
                pass

        conn.execute('DELETE FROM tickets WHERE id=?', (ticket_id,))
        conn.commit()

    return jsonify({'success': True})

# ---------------------------------------------------------------------------
# Uploads ausliefern
# ---------------------------------------------------------------------------
@app.route('/uploads/<filename>')
@login_required
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

# ---------------------------------------------------------------------------
# Start (init bei Gunicorn-Start auf Modul-Ebene)
# ---------------------------------------------------------------------------
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
init_db()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=False)
