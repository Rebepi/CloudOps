from flask import request
import os
import pickle
import requests
import jwt


def unsafe_sql(cursor):
    value = request.args.get("name")
    query = "SELECT * FROM users WHERE name = '" + value + "'"
    cursor.execute(query)


def safe_sql(cursor):
    value = request.args.get("name")
    cursor.execute("SELECT * FROM users WHERE name = %s", (value,))


def unsafe_command():
    value = request.args.get("command")
    os.system(value)


def unsafe_http():
    value = request.args.get("url")
    requests.get(value)


def unsafe_deserialize():
    value = request.args.get("payload")
    pickle.loads(value)


def unsafe_token(token):
    return jwt.decode(token, options={"verify_signature": False})


@app.get("/unsafe")
def unsafe_fastapi(name: str):
    cursor.execute("SELECT * FROM users WHERE name = '" + name + "'")


@app.get("/safe")
def safe_fastapi(name: str):
    cursor.execute("SELECT * FROM users WHERE name = %s", (name,))
