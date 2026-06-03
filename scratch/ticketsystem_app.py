"""
TheOmniStack Ticket-System
Multi-Tenant Support mit Rollen-basiertem Zugriff
"""

import os
import sqlite3
import hashlib
import secrets
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
                geschlossen_am TEXT,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        ''')
        # Migrationen: fehlende Spalten ergänzen
        for migration in [
            'ALTER TABLE tickets ADD COLUMN user_id INTEGER',
            "ALTER TABLE tickets ADD COLUMN kategorie TEXT NOT NULL DEFAULT 'TheOmniStack'",
            "ALTER TABLE users ADD COLUMN default_status_filter TEXT DEFAULT 'alle'",
            "ALTER TABLE users ADD COLUMN default_prioritaet_filter TEXT DEFAULT 'alle'",
            "ALTER TABLE users ADD COLUMN default_kategorie_filter TEXT DEFAULT 'alle'",
            "ALTER TABLE tickets ADD COLUMN geschlossen_am TEXT",
        ]:
            try:
                conn.execute(migration)
            except Exception:
                pass
                
        conn.execute('''
            CREATE TABLE IF NOT EXISTS comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                text TEXT NOT NULL,
                erstellt_am TEXT NOT NULL,
                FOREIGN KEY (ticket_id) REFERENCES tickets(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        ''')
        
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
    user_role = session.get('role', 'haendler')
    user_id   = session.get('user_id')

    # Standard-Filter laden, falls keine URL-Parameter übergeben wurden
    user_defaults = None
    if 'status' not in request.args and 'prioritaet' not in request.args and 'kategorie' not in request.args:
        with get_db() as conn:
            user_defaults = conn.execute(
                'SELECT default_status_filter, default_prioritaet_filter, default_kategorie_filter FROM users WHERE id = ?',
                (user_id,)
            ).fetchone()

    if user_defaults:
        status_filter     = user_defaults['default_status_filter'] or 'alle'
        prioritaet_filter = user_defaults['default_prioritaet_filter'] or 'alle'
        kategorie_filter  = user_defaults['default_kategorie_filter'] or 'alle'
    else:
        status_filter     = request.args.get('status', 'alle')
        prioritaet_filter = request.args.get('prioritaet', 'alle')
        kategorie_filter  = request.args.get('kategorie', 'alle')

    suche             = request.args.get('suche', '').strip()
    erstellt_am_filter = request.args.get('erstellt_am', '').strip()
    geschlossen_am_filter = request.args.get('geschlossen_am', '').strip()

    query  = '''SELECT t.*, u.name as user_name, u.email as user_email
                FROM tickets t LEFT JOIN users u ON t.user_id = u.id
                WHERE 1=1'''
    params = []

    # Händler sehen nur eigene Tickets
    if user_role == 'haendler':
        query += ' AND t.user_id = ?'
        params.append(user_id)

    if erstellt_am_filter:
        try:
            d = datetime.strptime(erstellt_am_filter, '%Y-%m-%d')
            erstellt_date_str = d.strftime('%d.%m.%Y')
            query += " AND t.erstellt_am LIKE ?"
            params.append(f"{erstellt_date_str}%")
        except ValueError:
            pass

    if geschlossen_am_filter:
        try:
            d = datetime.strptime(geschlossen_am_filter, '%Y-%m-%d')
            geschlossen_date_str = d.strftime('%d.%m.%Y')
            query += " AND t.geschlossen_am LIKE ?"
            params.append(f"{geschlossen_date_str}%")
        except ValueError:
            pass

    if status_filter == 'nicht_erledigt':
        query += " AND t.status != 'Erledigt'"
    elif status_filter != 'alle':
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

    query += ''' ORDER BY CASE t.prioritaet WHEN "Hoch" THEN 1 WHEN "Mittel" THEN 2 ELSE 3 END, t.id DESC'''

    stats_where  = 'WHERE 1=1'
    stats_params = []
    if user_role == 'haendler':
        stats_where  += ' AND user_id = ?'
        stats_params.append(user_id)

    with get_db() as conn:
        tickets = conn.execute(query, params).fetchall()
        stats   = conn.execute(f'''
            SELECT
                COUNT(*) as gesamt,
                SUM(CASE WHEN status="Offen" THEN 1 ELSE 0 END) as offen,
                SUM(CASE WHEN status="In Bearbeitung" THEN 1 ELSE 0 END) as in_bearbeitung,
                SUM(CASE WHEN status="Erledigt" THEN 1 ELSE 0 END) as erledigt,
                SUM(CASE WHEN prioritaet="Hoch" THEN 1 ELSE 0 END) as hoch
            FROM tickets {stats_where}
        ''', stats_params).fetchone()

    return render_template(
        'dashboard.html',
        tickets=tickets,
        stats=stats,
        status_filter=status_filter,
        prioritaet_filter=prioritaet_filter,
        kategorie_filter=kategorie_filter,
        suche=suche,
        erstellt_am_filter=erstellt_am_filter,
        geschlossen_am_filter=geschlossen_am_filter,
        user_role=user_role,
        kategorien=KATEGORIEN,
    )

# ---------------------------------------------------------------------------
# Routen: Ticket erstellen
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

        comments = conn.execute('''
            SELECT c.*, u.name as user_name, u.role as user_role
            FROM comments c LEFT JOIN users u ON c.user_id = u.id
            WHERE c.ticket_id = ?
            ORDER BY c.id ASC
        ''', (ticket_id,)).fetchall()

    if not ticket:
        flash('Ticket nicht gefunden.', 'error')
        return redirect(url_for('dashboard'))

    # Händler dürfen nur eigene Tickets sehen
    if user_role == 'haendler' and ticket['user_id'] != user_id:
        flash('Keine Berechtigung.', 'error')
        return redirect(url_for('dashboard'))

    return render_template('detail.html', ticket=ticket, user_role=user_role, comments=comments)

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
    if status not in ['Offen', 'In Bearbeitung', 'Erledigt']:
        return jsonify({'error': 'Ungültiger Status'}), 400

    with get_db() as conn:
        jetzt_str = jetzt()
        geschlossen_am = jetzt_str if status == 'Erledigt' else None
        conn.execute('UPDATE tickets SET status=?, geaendert_am=?, geschlossen_am=? WHERE id=?',
                     (status, jetzt_str, geschlossen_am, ticket_id))
        conn.commit()

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
# API: Kommentar hinzufügen (AJAX)
# ---------------------------------------------------------------------------
@app.route('/api/ticket/<int:ticket_id>/comment', methods=['POST'])
@login_required
def add_comment(ticket_id):
    user_id = session.get('user_id')
    user_role = session.get('role', 'haendler')
    
    data = request.get_json() or {}
    text = data.get('text', '').strip()
    
    if not text:
        return jsonify({'error': 'Kommentar darf nicht leer sein.'}), 400

    with get_db() as conn:
        ticket = conn.execute('SELECT user_id FROM tickets WHERE id=?', (ticket_id,)).fetchone()
        if not ticket:
            return jsonify({'error': 'Ticket nicht gefunden'}), 404
            
        if user_role == 'haendler' and ticket['user_id'] != user_id:
            return jsonify({'error': 'Keine Berechtigung'}), 403

        jetzt_str = jetzt()
        conn.execute('''
            INSERT INTO comments (ticket_id, user_id, text, erstellt_am)
            VALUES (?, ?, ?, ?)
        ''', (ticket_id, user_id, text, jetzt_str))
        conn.commit()

    return jsonify({'success': True})

# ---------------------------------------------------------------------------
# API: Benutzer-Einstellungen ändern (AJAX)
# ---------------------------------------------------------------------------
@app.route('/api/user/settings', methods=['POST'])
@login_required
def update_user_settings():
    user_id = session.get('user_id')
    data = request.get_json() or {}
    status = data.get('status', 'alle')
    prioritaet = data.get('prioritaet', 'alle')
    kategorie = data.get('kategorie', 'alle')

    if status not in ['alle', 'nicht_erledigt', 'Offen', 'In Bearbeitung', 'Erledigt']:
        return jsonify({'error': 'Ungültiger Status'}), 400
    if prioritaet not in ['alle', 'Hoch', 'Mittel', 'Niedrig']:
        return jsonify({'error': 'Ungültige Priorität'}), 400
    if kategorie not in ['alle'] + KATEGORIEN:
        return jsonify({'error': 'Ungültige Kategorie'}), 400

    with get_db() as conn:
        conn.execute('''
            UPDATE users
            SET default_status_filter = ?, default_prioritaet_filter = ?, default_kategorie_filter = ?
            WHERE id = ?
        ''', (status, prioritaet, kategorie, user_id))
        conn.commit()

    return jsonify({'success': True})

# ---------------------------------------------------------------------------
# API: Ticket Suchvorschläge (AJAX)
# ---------------------------------------------------------------------------
@app.route('/api/tickets/suggest')
@login_required
def tickets_suggest():
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify([])

    user_role = session.get('role', 'haendler')
    user_id = session.get('user_id')

    query = '''SELECT t.id, t.titel, t.status 
               FROM tickets t 
               WHERE (t.titel LIKE ? OR t.beschreibung LIKE ?)'''
    params = [f'%{q}%', f'%{q}%']

    if user_role == 'haendler':
        query += ' AND t.user_id = ?'
        params.append(user_id)

    query += ' LIMIT 6'

    with get_db() as conn:
        rows = conn.execute(query, params).fetchall()

    suggestions = [{'id': r['id'], 'titel': r['titel'], 'status': r['status']} for r in rows]
    return jsonify(suggestions)

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
