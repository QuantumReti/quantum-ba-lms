from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    print("Navigating to page...")
    try:
        page.goto('https://gemini.google.com/share/4a3b4928ed99', wait_until='domcontentloaded', timeout=45000)
    except Exception as e:
        print("Timeout or error navigating, but proceeding anyway:", e)
    
    print("Waiting for 10 seconds...")
    time.sleep(10)
    
    # Try to find the canvas iframe
    frames = page.frames
    print(f"Found {len(frames)} frames.")
    for i, f in enumerate(frames):
        print(f"Frame {i}: {f.url}, name: {f.name}")
        try:
            content = f.content()
            print(f"Frame {i} content length: {len(content)}")
            if "Quantum" in content or "<html" in content.lower():
                # Let's write all interesting frames just in case
                safe_name = f.name if f.name else f"frame_{i}"
                if not safe_name.replace('_','').isalnum():
                    safe_name = f"frame_{i}"
                with open(f'C:/Users/Josh/quantum-ba-lms/{safe_name}.html', 'w', encoding='utf-8') as f_out:
                    f_out.write(content)
                print(f"Saved frame {safe_name} to file.")
        except Exception as e:
            print(f"Error accessing frame {i} ({f.url}): {e}")
                
    with open('C:/Users/Josh/quantum-ba-lms/main_page_2.html', 'w', encoding='utf-8') as f_main:
        try:
            f_main.write(page.content())
        except Exception as e:
            print(f"Error reading main page content: {e}")
        
    browser.close()
