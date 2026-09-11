"""Tests for the widget config domain (ticket #24).

Per-user layout persistence + global lock enforcement.
"""
from __future__ import annotations

import pytest

from test_auth import _db_conn, bearer, client, login

ADMIN = ("admin@hospital.test", "Hospital2025!")
DOCTOR = ("doctor@hospital.test", "Hospital2025!")


def _admin_h():
    return bearer(login(*ADMIN)["access_token"])


def _doctor_h():
    return bearer(login(*DOCTOR)["access_token"])


def test_list_widgets_library():
    h = _doctor_h()
    r = client.get("/widget-config/widgets", headers=h)
    assert r.status_code == 200
    widgets = r.json()["widgets"]
    assert len(widgets) > 0
    assert all("id" in w and "key" in w for w in widgets)


def test_save_layout_creates_user_widget_layout_rows():
    h = _doctor_h()
    widgets = client.get("/widget-config/widgets", headers=h).json()["widgets"]
    assert len(widgets) >= 2
    layout = {
        "items": [
            {"widget_id": widgets[0]["id"], "position_order": 0, "enabled": True, "size": "medium"},
            {"widget_id": widgets[1]["id"], "position_order": 1, "enabled": True, "size": "small"},
        ]
    }
    r = client.put("/widget-config/me", headers=h, json=layout)
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert len(items) >= 2


def test_get_layout_returns_saved_items():
    h = _doctor_h()
    widgets = client.get("/widget-config/widgets", headers=h).json()["widgets"]
    layout = {
        "items": [
            {"widget_id": widgets[0]["id"], "position_order": 0, "size": "large"},
        ]
    }
    client.put("/widget-config/me", headers=h, json=layout)
    r = client.get("/widget-config/me", headers=h)
    assert r.status_code == 200
    items = r.json()["items"]
    assert any(i["widget_id"] == widgets[0]["id"] for i in items)


def test_locked_widget_cannot_be_removed_by_user():
    h_admin = _admin_h()
    h_doc = _doctor_h()
    widgets = client.get("/widget-config/widgets", headers=h_doc).json()["widgets"]
    target = widgets[0]
    # Lock it as admin
    lr = client.patch(
        f"/widget-config/widgets/{target['id']}/lock", headers=h_admin,
        json={"globally_locked": True},
    )
    assert lr.status_code == 200
    # Doctor tries to remove via DELETE
    dr = client.delete(f"/widget-config/me/{target['id']}", headers=h_doc)
    assert dr.status_code == 403


def test_locked_widget_re_added_on_layout_save():
    h_admin = _admin_h()
    h_doc = _doctor_h()
    widgets = client.get("/widget-config/widgets", headers=h_doc).json()["widgets"]
    target = widgets[0]
    # Lock
    client.patch(
        f"/widget-config/widgets/{target['id']}/lock", headers=h_admin,
        json={"globally_locked": True},
    )
    # Doctor saves layout that DOESN'T include the locked widget
    other = widgets[1] if len(widgets) > 1 else widgets[0]
    client.put(
        "/widget-config/me", headers=h_doc,
        json={"items": [{"widget_id": other["id"], "position_order": 0}]},
    )
    # The locked widget should still be in the layout (re-inserted)
    r = client.get("/widget-config/me", headers=h_doc)
    items = r.json()["items"]
    assert any(i["widget_id"] == target["id"] for i in items)


def test_unlocks_widget_after_admin_toggle():
    h_admin = _admin_h()
    h_doc = _doctor_h()
    widgets = client.get("/widget-config/widgets", headers=h_doc).json()["widgets"]
    target = widgets[0]
    # Lock + verify
    client.patch(
        f"/widget-config/widgets/{target['id']}/lock", headers=h_admin,
        json={"globally_locked": True},
    )
    # Unlock
    r = client.patch(
        f"/widget-config/widgets/{target['id']}/lock", headers=h_admin,
        json={"globally_locked": False},
    )
    assert r.status_code == 200
    assert not r.json()["globally_locked"]  # may be 0/False from SQLite
    # Doctor can now remove
    dr = client.delete(f"/widget-config/me/{target['id']}", headers=h_doc)
    assert dr.status_code == 204


def test_doctor_cannot_lock_widget_403():
    h_doc = _doctor_h()
    widgets = client.get("/widget-config/widgets", headers=h_doc).json()["widgets"]
    r = client.patch(
        f"/widget-config/widgets/{widgets[0]['id']}/lock", headers=h_doc,
        json={"globally_locked": True},
    )
    assert r.status_code == 403