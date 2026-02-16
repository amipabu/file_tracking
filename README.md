# 📁 Procurement File Tracking System

A Dockerized web application for team leaders to track procurement files assigned to contracting officers, enforce SLA deadlines, and manage multi-step procurement workflows.

---

## ✨ Features

- **Dashboard** — At-a-glance stats (total, active, overdue, completed files), officer workload chart, and recent files
- **File Management** — Create, view, advance, and track procurement files through multi-step workflows
- **5 Procurement Processes** — Sole Source (7 steps), Two Phase Solicitation (17 steps), One Phase Solicitation (11 steps), Service Solicitation Above TA (12 steps), Service Solicitation Under TA (11 steps)
- **Step Timeline** — Visual timeline for each file showing SLA status per step (met, overdue, pending)
- **Step Comments** — Add or edit notes on any step to document progress
- **SLA Enforcement** — Automatic hourly SLA checks via cron, with manual trigger option
- **Overdue Notifications** — In-app notification center for overdue files
- **Officer Management** — Add/remove contracting officers, view file counts
- **File Transfer** — Reassign files between officers (per-file target selection)
- **Past File Import** — Backdate files with a custom assignment date and starting step; prior steps are auto-completed with realistic timestamps
- **Email Notifications** — Opens the default email client via `mailto:` when files are assigned or transferred
- **Admin Authentication** — JWT-based login with forced password change on first sign-in
- **Dark-Themed UI** — Modern, responsive single-page interface

---

## 🏗️ Architecture

| Layer          | Technology                |
|----------------|---------------------------|
| Frontend       | HTML / CSS / Vanilla JS   |
| Backend        | Node.js 20 + Express      |
| Database       | PostgreSQL 16 (Alpine)    |
| Orchestration  | Docker Compose            |

```
┌────────────────────────────────────┐
│          Browser (SPA)             │
│   HTML + CSS + Vanilla JavaScript  │
└──────────────┬─────────────────────┘
               │ HTTP / REST
┌──────────────▼─────────────────────┐
│        Node.js + Express           │
│  ┌──────────┐  ┌────────────────┐  │
│  │ Auth JWT │  │ SLA Cron (1hr) │  │
│  └──────────┘  └────────────────┘  │
│  Routes: auth, files, officers,    │
│  processes, notifications          │
└──────────────┬─────────────────────┘
               │ pg (TCP :5432)
┌──────────────▼─────────────────────┐
│         PostgreSQL 16              │
│  Tables: admin, officers, files,   │
│  processes, process_steps,         │
│  file_step_log, notifications      │
└────────────────────────────────────┘
```

---

## 🚀 Getting Started

### Prerequisites

- [Docker](https://www.docker.com/get-started) & Docker Compose

### Quick Start

```bash
# Clone the repository
git clone https://github.com/amipabu/file_tracking.git
cd file_tracking

# Build and start
docker compose up --build -d
```

The app will be available at **http://localhost:3000**

### Default Credentials

| Field    | Value      |
|----------|------------|
| Username | `admin`    |
| Password | `admin123` |

> **Note:** You will be prompted to change your password on first login.

### Stopping the App

```bash
docker compose down        # Stop containers (data is preserved)
docker compose down -v     # Stop containers and delete all data
```

---

## 📖 Usage Guide

### 1. Sign In
Navigate to `http://localhost:3000` and log in with the default credentials. You'll be prompted to set a new password.

### 2. Add Officers
Go to **Officers** → **+ New Officer**. Enter the officer's name and email address.

### 3. Create a Procurement File
Go to **Files** → **+ New File**:
- **PR Number** — Unique purchase requisition number (e.g. `PR-2026-001`)
- **File Title** — Description of the procurement
- **Process** — Select one of the 5 procurement processes
- **Officer** — Assign to a contracting officer
- **Assignment Date** *(optional)* — Set a past date for importing existing files
- **Current Step** *(optional)* — Select which step the file is already on (prior steps will be auto-completed)

### 4. Track Progress
- Click **View** on any file to see the full step timeline
- Click **Advance** to move a file to its next step
- Add comments to document SLA compliance

### 5. Monitor SLAs
- The **Dashboard** shows overdue file counts
- The **Notifications** page lists all overdue alerts
- SLAs are checked automatically every hour
- Click **Check SLAs Now** in the sidebar for an immediate check

### 6. Transfer Files
On the **Officers** page, click **Transfer Files** on an officer's card to reassign their active files to other officers (one-by-one or in bulk).

---

## 🔌 API Reference

All API routes (except `/api/auth/login` and `/api/health`) require a JWT token in the `Authorization: Bearer <token>` header.

### Authentication

| Method | Endpoint              | Description                    |
|--------|-----------------------|--------------------------------|
| POST   | `/api/auth/login`     | Sign in, receive JWT token     |
| PUT    | `/api/auth/password`  | Change password (auth required)|
| GET    | `/api/auth/me`        | Get current user info          |

### Officers

| Method | Endpoint                      | Description                     |
|--------|-------------------------------|---------------------------------|
| GET    | `/api/officers`               | List all officers               |
| POST   | `/api/officers`               | Create a new officer            |
| DELETE | `/api/officers/:id`           | Remove an officer               |
| PUT    | `/api/officers/:id/transfer`  | Batch transfer files to other officers |

### Files

| Method | Endpoint                    | Description                              |
|--------|-----------------------------|-----------------------------------------|
| GET    | `/api/files`                | List files (filterable by `officer_id`, `status`, `process_name`) |
| GET    | `/api/files/:id`            | Get file details with step history       |
| POST   | `/api/files`                | Create a new file (supports backdating)  |
| PUT    | `/api/files/:id/advance`    | Advance file to the next step            |
| GET    | `/api/files/stats/summary`  | Dashboard statistics                     |

### Processes

| Method | Endpoint                        | Description                  |
|--------|---------------------------------|------------------------------|
| GET    | `/api/processes`                | List all procurement processes|
| GET    | `/api/processes/:name/steps`    | List steps for a process     |

### Notifications

| Method | Endpoint                           | Description               |
|--------|------------------------------------|---------------------------|
| GET    | `/api/notifications`               | List all notifications    |
| PUT    | `/api/notifications/read-all`      | Mark all as read          |

### Utility

| Method | Endpoint          | Description                |
|--------|--------------------|---------------------------|
| GET    | `/api/health`      | Health check (public)      |
| POST   | `/api/sla-check`   | Trigger manual SLA check   |

---

## 📂 Project Structure

```
file_tracking/
├── db/
│   ├── init.sql              # Database schema + seed data (5 processes, 58 steps)
│   └── pool.js               # PostgreSQL connection pool
├── middleware/
│   └── auth.js               # JWT authentication middleware
├── public/
│   ├── css/
│   │   └── styles.css        # Dark-themed design system
│   ├── js/
│   │   └── app.js            # Frontend SPA logic
│   └── index.html            # Single-page application shell
├── routes/
│   ├── auth.js               # Login, password change, user info
│   ├── files.js              # File CRUD, advance, stats
│   ├── notifications.js      # Notification listing + mark read
│   ├── officers.js           # Officer CRUD + file transfer
│   └── processes.js          # Process & step listing
├── services/
│   └── slaChecker.js         # Hourly SLA overdue detection
├── docker-compose.yml        # Two-service stack (db + app)
├── Dockerfile                # Node.js 20 Alpine image
├── package.json              # Dependencies & scripts
└── server.js                 # Express server, cron, startup logic
```

---

## ⚙️ Environment Variables

| Variable        | Default                                                | Description                          |
|-----------------|--------------------------------------------------------|--------------------------------------|
| `DATABASE_URL`  | `postgres://tracker:tracker_pass@db:5432/file_tracking`| PostgreSQL connection string         |
| `JWT_SECRET`    | `file-tracker-secret-key-change-in-production`         | Secret key for JWT signing           |
| `PORT`          | `3000`                                                 | Server port                          |
| `NODE_ENV`      | `production`                                           | Node.js environment                  |

> **⚠️ Production:** Always set a strong, unique `JWT_SECRET` in your environment.

---

## 🗄️ Database Schema

| Table            | Purpose                                      |
|------------------|----------------------------------------------|
| `admin`          | Admin user accounts with bcrypt-hashed passwords |
| `officers`       | Contracting officers (name, email)           |
| `processes`      | Procurement process types                    |
| `process_steps`  | Ordered steps per process with SLA days      |
| `files`          | Procurement files with current step & status |
| `file_step_log`  | Step transition history with timestamps & comments |
| `notifications`  | SLA overdue notifications per officer/file   |

---

## 🔒 Security

- **JWT Authentication** — All API routes (except login and health check) require a valid Bearer token
- **bcrypt Password Hashing** — Admin passwords are hashed with bcryptjs (10 rounds)
- **Forced Password Change** — Admin is required to change the default password on first login
- **Auto-Logout** — Invalid or expired tokens trigger automatic sign-out

---

## 📝 License

This project is provided as-is for internal procurement tracking use.
