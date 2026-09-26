import re
import pytest
from playwright.sync_api import Page, expect

# Playwright E2E browser tests for Wenup Document Intake Assistant
# Target URL is http://localhost:8000 (served by FastAPI)

BASE_URL = "http://localhost:8000"


def test_landing_screen_and_get_started_transition(page: Page):
    page.goto(BASE_URL)
    
    # 1. Landing screen should be visible on initial load
    landing_screen = page.locator("#landing-screen")
    expect(landing_screen).to_be_visible()
    
    # 2. Yellow explainer tag should be present on the left
    explainer = page.locator(".landing-explainer-yellow")
    expect(explainer).to_be_visible()
    expect(explainer).to_contain_text("Conversational legal intake assistant")
    
    # 3. Get Started button should be present
    get_started_btn = page.locator("#landing-get-started-btn")
    expect(get_started_btn).to_be_visible()
    
    # 4. Click Get Started and verify transition to main app shell
    get_started_btn.click()
    page.wait_for_timeout(500)
    expect(landing_screen).not_to_be_visible()
    
    # 5. App header and chat log should be ready
    expect(page.locator(".brand-logo")).to_be_visible()
    expect(page.locator("#chat-log")).to_be_visible()


def test_conversational_intake_flow(page: Page):
    page.goto(BASE_URL)
    page.locator("#landing-get-started-btn").click()
    
    # Wait for connected status
    expect(page.locator("#status-label")).to_have_text("Connected", timeout=10000)
    
    # Wait for assistant initial greeting
    assistant_msg = page.locator(".chat-bubble.assistant")
    expect(assistant_msg.first).to_be_visible()
    expect(assistant_msg.first).to_contain_text("Wenup Document Intake Assistant")
    
    # Submit user's full name in chat
    chat_input = page.locator("#chat-input")
    chat_input.fill("Eleanor Vance")
    page.locator("#send-btn").click()
    
    # Verify user message appears in chat log
    page.wait_for_timeout(800)
    user_msg = page.locator(".chat-bubble.user")
    expect(user_msg.first).to_contain_text("Eleanor Vance")
    
    # Verify Full Name state card (Tile #1) updates
    full_name_card = page.locator('.state-card-flip-container[data-field-key="full_name"]')
    expect(full_name_card).to_be_visible()
    expect(full_name_card).to_contain_text("Eleanor Vance", timeout=15000)


def test_human_in_the_loop_direct_tile_editing(page: Page):
    page.goto(BASE_URL)
    page.locator("#landing-get-started-btn").click()
    
    # Wait for connected status
    expect(page.locator("#status-label")).to_have_text("Connected", timeout=10000)
    
    # Locate Full Name card (Tile #1) and click Edit button
    edit_btn = page.locator("#tile-edit-btn-1")
    expect(edit_btn).to_be_visible()
    edit_btn.click()
    
    # Verify inline edit input appears
    tile_input = page.locator("#tile-input-1")
    expect(tile_input).to_be_visible()
    
    # Type new name and click Save
    tile_input.fill("Sir Arthur Conan Doyle")
    page.locator("#tile-save-1").click()
    
    # Wait for card to re-render with the saved value
    full_name_card = page.locator('.state-card-flip-container[data-field-key="full_name"]')
    expect(full_name_card).to_contain_text("Sir Arthur Conan Doyle", timeout=5000)
    
    # Verify draft document pane reflects the edited name
    doc_text = page.locator("#document-text")
    expect(doc_text).to_contain_text("Sir Arthur Conan Doyle")


def test_card_flip_artwork_and_tile_assets(page: Page):
    page.goto(BASE_URL)
    page.locator("#landing-get-started-btn").click()
    expect(page.locator("#status-label")).to_have_text("Connected", timeout=10000)
    
    # Locate Tile #1 container and click card -- verify it does NOT flip during intake
    card_container = page.locator('.state-card-flip-container[data-tile-index="1"]')
    expect(card_container).to_be_visible()
    card_container.click()
    expect(card_container).not_to_have_class(re.compile(r"is-flipped"))
    
    # Trigger completion via finish button
    finish_btn = page.locator("#header-finish-btn")
    if finish_btn.is_visible():
        finish_btn.click()
    else:
        page.evaluate("finishDocumentNow()")
    
    # Verify cards flip on completion
    expect(card_container).to_have_class(re.compile(r"is-flipped"))
    
    # Verify tile image source is field_tiles/10.png
    tile_img = card_container.locator("img.tile-art-img")
    expect(tile_img).to_have_attribute("src", "field_tiles/10.png")
    
    # Check Tile #9 uses field_tiles/11.png
    tile_9_container = page.locator('.state-card-flip-container[data-tile-index="9"]')
    expect(tile_9_container).to_have_class(re.compile(r"is-flipped"))
    tile_9_img = tile_9_container.locator("img.tile-art-img")
    expect(tile_9_img).to_have_attribute("src", "field_tiles/11.png")


def test_pdf_download_functionality(page: Page):
    page.goto(BASE_URL)
    page.locator("#landing-get-started-btn").click()
    expect(page.locator("#status-label")).to_have_text("Connected", timeout=10000)
    
    # Enter full name
    chat_input = page.locator("#chat-input")
    chat_input.fill("Arthur Pendelton")
    page.locator("#send-btn").click()
    page.wait_for_timeout(800)
    
    # Switch to Draft Document tab
    page.locator("#tab-doc-btn").click()
    download_btn = page.locator("#download-doc-btn")
    expect(download_btn).to_be_visible()
    
    # Catch download event
    with page.expect_download(timeout=10000) as download_info:
        download_btn.click()
    
    download = download_info.value
    assert "Personal_Wishes_Document" in download.suggested_filename
    assert download.suggested_filename.endswith(".pdf")


def test_bulk_input_does_not_flip_until_verified(page: Page):
    page.goto(BASE_URL)
    page.locator("#landing-get-started-btn").click()
    expect(page.locator("#status-label")).to_have_text("Connected", timeout=10000)

    # Submit all 9 fields in a single comprehensive multi-field message
    chat_input = page.locator("#chat-input")
    bulk_message = (
        "I am John Connor, living at 10 Downing Street, London. I have worldwide assets and "
        "two children named Tim and May. My executor is my wife Sarah Connor. "
        "Specific gifts: give my watch to James. Wishes: play jazz at my funeral."
    )
    chat_input.fill(bulk_message)
    page.locator("#send-btn").click()

    # Wait for assistant response asking to verify details
    expect(page.locator(".chat-bubble.assistant").last).to_contain_text("review", timeout=15000)

    # Verify that all 9 cards remain on the FRONT face (unflipped) showing their confirmed values
    for i in range(1, 10):
        card = page.locator(f'.state-card-flip-container[data-tile-index="{i}"]')
        expect(card).to_be_visible()
        expect(card).not_to_have_class(re.compile(r"is-flipped"))

    # Quick chip for verification should now be visible
    verified_chip = page.locator('.quick-chip:has-text("Everything is verified")')
    expect(verified_chip).to_be_visible()

    # Click the verification chip
    verified_chip.click()
    page.wait_for_timeout(600)

    # Now verify all 9 cards flip to back art face
    for i in range(1, 10):
        card = page.locator(f'.state-card-flip-container[data-tile-index="{i}"]')
        expect(card).to_have_class(re.compile(r"is-flipped"))


