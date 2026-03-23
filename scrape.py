import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        print("Navigating to Gemini share link...")
        await page.goto("https://gemini.google.com/share/4a3b4928ed99", wait_until="load")
        
        # Wait a bit longer for canvas to render
        await page.wait_for_timeout(10000)
        
        print(f"Number of iframes found: {len(page.main_frame.child_frames)}")
        
        with open("C:\\Users\\Josh\\quantum-ba-lms\\debug_page.html", "w", encoding="utf-8") as f:
            f.write(await page.content())
            
        found = False
        for i, iframe in enumerate(page.main_frame.child_frames):
            try:
                content = await iframe.content()
                print(f"Iframe {i} length: {len(content)}")
                if "DOCTYPE html" in content or "Quantum BA" in content or "body" in content:
                    with open(f"C:\\Users\\Josh\\quantum-ba-lms\\canvas_export_{i}.html", "w", encoding="utf-8") as f:
                        f.write(content)
                    print(f"Saved iframe {i} content to canvas_export_{i}.html")
                    found = True
            except Exception as e:
                print(f"Failed to read iframe {i}: {e}")
        
        if not found:
            print("Could not find the target iframe contents.")
            
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
