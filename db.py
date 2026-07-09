"""
db.py - Kết nối SQL Server (pyodbc) & helper dùng chung cho mọi module
"""
import os
import pyodbc


def get_connection():
    driver = os.getenv("SQL_DRIVER", "{ODBC Driver 18 for SQL Server}")
    server = os.getenv("SQL_SERVER", "localhost")
    database = os.getenv("SQL_DATABASE", "xyz_meeting_room")
    auth_mode = os.getenv("SQL_AUTH_MODE", "sql")  # "sql" hoặc "windows"
    encrypt = os.getenv("SQL_ENCRYPT", "yes")
    trust_cert = os.getenv("SQL_TRUST_SERVER_CERTIFICATE", "yes")

    if auth_mode == "windows":
        conn_str = (
            f"DRIVER={driver};SERVER={server};DATABASE={database};"
            f"Trusted_Connection=yes;Encrypt={encrypt};TrustServerCertificate={trust_cert}"
        )
    else:
        user = os.getenv("SQL_USERNAME", "sa")
        password = os.getenv("SQL_PASSWORD", "")
        conn_str = (
            f"DRIVER={driver};SERVER={server};DATABASE={database};"
            f"UID={user};PWD={password};Encrypt={encrypt};"
            f"TrustServerCertificate={trust_cert}"
        )
    return pyodbc.connect(conn_str)


def dict_rows(cursor):
    columns = [col[0] for col in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def dict_row(cursor):
    row = cursor.fetchone()
    if not row:
        return None
    columns = [col[0] for col in cursor.description]
    return dict(zip(columns, row))
