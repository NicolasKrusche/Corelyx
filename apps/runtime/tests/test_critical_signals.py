from engine.critical_signals import screen_text


def test_benign_business_text_is_not_critical():
    for text in [
        "Let's sync on the Q3 deadline tomorrow morning.",
        "Please kill the stuck build process and redeploy.",
        "URGENT: the invoice payment is overdue, can you action it?",
        "We need to blow up the old pricing model and rethink it.",
    ]:
        assert screen_text(text).critical is False, text


def test_poisoning_threat_is_flagged():
    r = screen_text("Before I quit I poisoned some of the food cans in the warehouse.")
    assert r.critical is True
    assert "contamination" in r.categories
    assert r.snippet


def test_threat_to_life_is_flagged():
    r = screen_text("I am going to kill everyone in that office on Monday.")
    assert r.critical is True
    assert "threat_to_life" in r.categories


def test_self_harm_is_flagged():
    r = screen_text("I don't want to live anymore, I'm going to end my life tonight.")
    assert r.critical is True
    assert "self_harm" in r.categories


def test_urgent_safety_emergency_is_flagged_but_plain_urgent_is_not():
    assert screen_text("URGENT: there is a safety hazard, someone could get injured.").critical is True
    assert screen_text("Urgent: please approve my expense report.").critical is False


def test_empty_text_is_safe():
    assert screen_text("").critical is False
