        import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
        import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
        import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

        // --- GEMINI API SETUP ---
        const apiKey = "AIzaSyC5h0hBZr1d7cguIYUxjhLxtPV6CjqaoLc";
        const modelName = "gemini-2.5-flash";
        window.callGemini = async function (userPrompt, systemInstruction) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
            const payload = { contents: [{ parts: [{ text: userPrompt }] }], system_instruction: { parts: [{ text: systemInstruction }] } };
            try {
                const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                if (!response.ok) throw new Error('API Error');
                const result = await response.json();
                return result.candidates?.[0]?.content?.parts?.[0]?.text;
            } catch (error) { return "AI service temporarily unavailable."; }
        }

        // --- FIREBASE SETUP ---
        const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : { apiKey: 'dummy', projectId: 'dummy', appId: 'dummy' };
        const app = initializeApp(firebaseConfig);
        const auth = getAuth(app);
        const db = getFirestore(app);
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'quantum-ba-lms';

        // --- APP STATE ---
        window.currentUser = null;
        window.userDocId = null;
        window.userData = {
            firstName: '', lastName: '', role: '', email: '', password: '', points: 0,
            completedModules: [], unlockedPhases: [1], favorites: [], isAdmin: false,
            loginHistory: [], examScore: null, examGrade: null, examPassed: null, examPercentage: null,
            savedSparringSession: null // Track saved AI Lab states
        };
        window.currentIndex = 0;
        window.currentTab = 'modules';
        window.flatItems = [];

        // --- AUTH & LOGIN LOGIC ---
        async function initAuth() {
            if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                await signInWithCustomToken(auth, __initial_auth_token);
            } else {
                await signInAnonymously(auth);
            }
        }
        initAuth();

        onAuthStateChanged(auth, (user) => {
            if (user) { window.currentUser = user; }
        });

        window.handleLogin = async function () {
            const email = document.getElementById('login-email').value.trim();
            const pass = document.getElementById('login-password').value;
            const btn = document.getElementById('login-btn-text');
            const msg = document.getElementById('login-msg');

            if (!email || !pass) { msg.innerText = "Email and password required."; return; }
            btn.innerText = "Authenticating...";

            if (email.toLowerCase() === 'josh@quantumbuyersagents.com' && pass === 'Quantum123!') {
                window.userData = {
                    firstName: 'Joshua', lastName: 'Reti', role: 'General Manager',
                    email, password: pass, points: 9999,
                    completedModules: [],
                    unlockedPhases: Array.from({ length: 26 }, (_, i) => i + 1),
                    favorites: [], isAdmin: true, loginHistory: [new Date().toISOString()]
                };
                window.userDocId = 'master_admin_josh';
                // Mock current user so various parts of the app don't fail validation
                window.currentUser = { uid: 'master_admin_josh', email: email };
                await saveUserData().catch(e => console.warn('Offline save failed', e));
                await loadModulesData().catch(e => console.warn('Offline load failed', e));
                enterApp();
                return;
            }

            if (!window.currentUser) { msg.innerText = "Connection error. Retrying..."; btn.innerText = "Sign In / Register"; return; }
            // Check Master Admin Account block moved up

            // Cloud Login for Standard Users
            try {
                const traineesRef = collection(db, 'artifacts', appId, 'public', 'data', 'trainees');
                const snap = await getDocs(traineesRef);
                let foundUser = null;

                snap.forEach(docSnap => {
                    const data = docSnap.data();
                    if (data.email && data.email.toLowerCase() === email.toLowerCase()) {
                        foundUser = { id: docSnap.id, ...data };
                    }
                });

                if (foundUser) {
                    if (foundUser.password === pass) {
                        window.userData = foundUser;
                        window.userDocId = foundUser.id;
                        if (!window.userData.unlockedPhases) window.userData.unlockedPhases = [1];
                        if (!window.userData.loginHistory) window.userData.loginHistory = [];

                        window.userData.loginHistory.push(new Date().toISOString());
                        await saveUserData();
                        await loadModulesData();
                        enterApp();
                    } else {
                        msg.innerText = "Incorrect password. Please try again.";
                        btn.innerText = "Sign In / Register";
                    }
                } else {
                    // Email not found -> Transition to Registration
                    document.getElementById('login-form').classList.add('hidden');
                    document.getElementById('register-form').classList.remove('hidden');
                }
            } catch (e) {
                console.error(e);
                msg.innerText = "Error accessing profile database.";
                btn.innerText = "Sign In / Register";
            }
        }

        window.handleRegister = async function () {
            const fname = document.getElementById('reg-fname').value;
            const lname = document.getElementById('reg-lname').value;
            const role = document.getElementById('reg-role').value;
            const email = document.getElementById('login-email').value;
            const pass = document.getElementById('login-password').value;
            const btnText = document.getElementById('reg-btn-text');

            if (!fname || !lname) return;
            btnText.innerText = "Creating Profile...";

            // Generate a unique ID for this user's data
            window.userDocId = 'user_' + Date.now() + Math.floor(Math.random() * 1000);

            window.userData = {
                firstName: fname, lastName: lname, role: role, email: email, password: pass,
                points: 0, completedModules: [], unlockedPhases: [1], favorites: [], isAdmin: false,
                loginHistory: [new Date().toISOString()]
            };

            await saveUserData().catch(e => console.warn('Offline save failed', e));
            await loadModulesData().catch(e => console.warn('Offline load failed', e));
            enterApp();
        }

        async function saveUserData() {
            if (!window.currentUser || !window.userDocId) return;

            if (firebaseConfig.apiKey === "dummy-api-key") {
                updateUIState();
                return;
            }

            // Save to public trainees collection so Admin can view and User can login across devices
            const publicDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'trainees', window.userDocId);
            await setDoc(publicDocRef, window.userData, { merge: true });

            updateUIState();
        }

        window.logout = function () {
            document.getElementById('app-container').classList.add('hidden', 'opacity-0');
            document.getElementById('login-screen').classList.remove('hidden', 'opacity-0');
            document.getElementById('login-email').value = '';
            document.getElementById('login-password').value = '';
            document.getElementById('login-form').classList.remove('hidden');
            document.getElementById('register-form').classList.add('hidden');
            document.getElementById('login-msg').innerText = "New users will be registered automatically.";
            document.getElementById('login-btn-text').innerText = "Sign In / Register";
            window.currentUser = null;
        }

        function enterApp() {
            document.getElementById('login-screen').classList.add('opacity-0');
            setTimeout(() => {
                document.getElementById('login-screen').classList.add('hidden');
                document.getElementById('app-container').classList.remove('hidden');
                setTimeout(() => document.getElementById('app-container').classList.remove('opacity-0'), 50);
                updateUIState();
                switchTab('modules'); // Force tab refresh to ensure Admin tabs show correctly
            }, 500);
        }

        function updateUIState() {
            document.getElementById('user-name-display').innerText = `${window.userData.firstName} ${window.userData.lastName}`;
            document.getElementById('user-role-display').innerText = window.userData.role || 'Agent Portal';
            document.getElementById('nav-points').innerText = window.userData.points;

            if (window.userData.isAdmin) {
                document.getElementById('user-role-display').innerText = 'ADMIN';
                document.getElementById('tab-admin').classList.remove('hidden');
                document.getElementById('edit-module-btn').classList.remove('hidden');
                document.getElementById('edit-module-btn').classList.add('flex');
            }
        }

        // --- CONTENT DATA (Structured for LMS) ---
        async function loadModulesData() {
            if (firebaseConfig.apiKey === "dummy-api-key") {
                buildDefaultModules();
                return;
            }
            try {
                const modulesDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'course', 'modules_list');
                const snap = await getDoc(modulesDocRef);

                if (snap.exists() && snap.data().items && snap.data().items.length > 50) {
                    window.flatItems = snap.data().items;
                    // DB Recovery: If the cloud saved the generic placeholder, forcefully overwrite it with the rich Matrix
                    if (window.flatItems[0] && window.flatItems[0].content.includes("is not about sales; it is about risk mitigation")) {
                        console.log("Generic template detected. Restoring Quantum Training Matrix...");
                        buildDefaultModules();
                        await setDoc(modulesDocRef, { items: window.flatItems });
                    }
                } else {
                    // Seed the database with defaults if empty or truncated
                    buildDefaultModules();
                    await setDoc(modulesDocRef, { items: window.flatItems });
                }
            } catch (e) {
                console.error("Error loading modules, using defaults", e);
                buildDefaultModules();
            }
        }

        function buildDefaultModules() {
            // Restore the detailed Core Intelligence Training Matrix
            const coreIntelligence = {
                "The A.A.R.M. Objection Framework": {
                    desc: "The 4-step communication architecture required to dominate the Quantum Sparring Lab.",
                    sections: [
                        { heading: "A - Acknowledge & Align", icon: "user-check", content: "Never fight the client's emotion with friction. Validate their fear. E.g., 'I completely understand why you're hesitant given the current headlines...'" },
                        { heading: "A - Anchor to Data", icon: "bar-chart-2", content: "Strip away the emotion by introducing pure, undeniable market mathematics or macroeconomic realities." },
                        { heading: "R - Reframe the Risk", icon: "refresh-cw", content: "Shift the perceived danger. The client thinks *buying* is risky. You must prove mathematically that *waiting* is the actual catastrophic risk (e.g., The 'Priced Out' Danger)." },
                        { heading: "M - Move to Action", icon: "arrow-right", content: "Do not wait for permission. Command the next step with authoritative momentum." }
                    ],
                    quiz: { q: "In the A.A.R.M. framework, what is the primary goal of the 'Reframe the Risk' stage?", options: ["To make the client feel uneducated for worrying.", "To mathematically prove that inaction (waiting) is more dangerous than taking action.", "To offer a discount to reduce their financial exposure.", "To suggest a cheaper, safer suburb to buy in."], ans: 1, exp: "Clients freeze when they fear action. You must show them that doing nothing is statistically more dangerous." }
                },
                "The Quantum Identity": {
                    desc: "Who we are, our USP, and the philosophy that governs our firm.",
                    sections: [
                        { heading: "Quantum USP & Flywheel", icon: "shield", content: "Quantum BA operates as a financial firewall. Our Unique Selling Point is our 'Information Asymmetry' and our absolute focus on capital preservation. The <strong>Quantum Flywheel</strong> works because we secure assets that outperform, which builds wealth, leading clients to return for purchase 2, 3, and 4. We don't sell houses; we engineer portfolios." },
                        { heading: "Key Takeaways", icon: "key", content: "We are risk mitigators, not matchmakers. Success is measured by our clients' long-term net worth, not commissions. The flywheel is powered by repeat client wins." },
                        { heading: "Things to Consider", icon: "alert-triangle", content: "Never compromise on our standards to close a deal quickly. One bad purchase can break the flywheel for a client and damage our reputation for a decade." }
                    ],
                    quiz: { q: "What drives the 'Quantum Flywheel'?", options: ["High-volume cold calling.", "Securing high-performing assets that lead to repeat business and referrals.", "Securing off-market assets quickly to maximize commission volume.", "Lowering our fees to attract more clients."], ans: 1, exp: "The flywheel relies on the excellence of our results creating a natural loop of repeat business." }
                },
                "Selling with Your Authentic Self": {
                    desc: "Moving beyond robotic scripts to high-trust advisory.",
                    sections: [
                        { heading: "Internal Logic: Vulnerability as Authority", icon: "user-check", content: "Clients are used to salespeople. Quantum BAs are advisors. We lead with radical honesty. If a brief is impossible, we say so in the first 5 minutes. This vulnerability creates instant authority." },
                        { heading: "Key Takeaways", icon: "key", content: "Authenticity means telling the client what they need to hear, not what they want to hear. Most agents focus on the 'search'. We focus on the 'filter'." },
                        { heading: "Things to Consider", icon: "alert-triangle", content: "Don't mistake authenticity for lack of professional polish. Be yourself, but be the 'Expert Version' of yourself." }
                    ],
                    quiz: { q: "What is 'Radical Honesty' in a Quantum discovery call?", options: ["Telling the client they have a nice house.", "Telling a client immediately if their brief is impossible for their budget.", "Telling the client their brief is challenging but you'll try your best.", "Sharing your personal life with the client."], ans: 1, exp: "Setting realistic expectations early is the foundation of trust." }
                },
                "The Holy Grail: Trusts & Bucket Companies": {
                    desc: "Optimizing the tax structure of high-performing assets.",
                    sections: [
                        { heading: "The Bucket Company Strategy", icon: "briefcase", content: "When a client has high rental income or multiple properties, they risk paying top-tier marginal tax. We advise buying in a Family Trust with a Corporate Trustee. Rental profits can be distributed to a 'Bucket Company' capped at the corporate tax rate (25-30%), preserving capital for the next deposit." },
                        { heading: "Division 7A Warning", icon: "alert-triangle", content: "<strong>Internal Logic:</strong> You must warn clients that taking cash out of the Bucket Company for personal use triggers Division 7A tax traps. The funds should stay in the company for future investments." },
                        { heading: "Key Takeaways", icon: "key", content: "Structruing is 50% of the wealth win. Growth assets in a trust preserve the 50% CGT discount while allowing income splitting." }
                    ],
                    quiz: { q: "What is the primary benefit of a 'Bucket Company'?", options: ["It provides a 50% CGT discount.", "It caps the tax on distributed rental profits at the corporate rate, preserving cash for future purchases.", "It caps the tax on distributed rental profits at the individual marginal rate.", "It makes the mortgage easier to get."], ans: 1, exp: "Bucket companies are cash-preservation tools, not growth tools." }
                },
                "The 3-to-4 Bed Value-Add": {
                    desc: "Manufacturing equity through technical layout optimization.",
                    sections: [
                        { heading: "The NCC Logic (National Construction Code)", icon: "ruler", content: "Converting a 3-bed house to a 4-bed house adds $50k-$100k in instant equity. To be a legal bedroom, it MUST meet NCC requirements: 1. Minimum ceiling height of 2.4m. 2. Natural light and ventilation equal to 10% of the floor area. 3. Minimum floor area." },
                        { heading: "The 'High-Set' QLD Lift", icon: "arrow-up", content: "In QLD, we look for 'legal height' under high-set homes. If the concrete pad to joist is >2.4m, the client can build-in for $80k and add $200k in value. If it's 2.3m, it is NOT a legal living space and adds zero bank-valuation value." },
                        { heading: "Key Takeaways", icon: "key", content: "Manufacturing equity requires technical knowledge of the NCC. Always carry a laser measurer to inspections." }
                    ],
                    quiz: { q: "What is the minimum legal ceiling height for a habitable bedroom under the NCC?", options: ["2.1m", "2.3m", "2.4m", "2.5m"], ans: 2, exp: "Anything under 2.4m is considered utility space and cannot be legally marketed as a bedroom." }
                }
            };

            const phaseStructure = [
                { id: 1, title: "Quantum DNA & Identity", topics: ["The Quantum Identity", "The Mandate: Rejecting Off-The-Plan", "Defining a 'Good' Decision", "The Quantum Philosophy", "Client Alignment & Boundaries", "The Ethics of Buyer Advocacy", "The Fiduciary Standard", "The Independence Product"] },
                { id: 2, title: "Regulatory Landscape & Compliance", topics: ["Legal & Compliance", "QLD Compliance: Risk & Value Creation", "NSW Compliance: Risk & Value Creation", "VIC Compliance: Risk & Value Creation", "Privacy & Data Handling via GHL", "Licensing & Interstate Operations", "Trust Account Protocols", "Ethics in Dual Agency Scenarios"] },
                { id: 3, title: "Systems, Tech Stack & GHL Mastery", topics: ["Managing my Pipeline", "Manual Lead Nurturing & Follow-Up", "Video Meetings & Internal Standards", "CRM Note-Taking & Audits", "Tracking Agent Motivations in GHL", "The Zero-Inbox Philosophy", "Email Communication Standards", "Task Delegation & Calendar Sync"] },
                { id: 4, title: "High-Velocity Prospecting", topics: ["The Ideal Client Profile (ICP) Identification", "The 'Authority Bait' Creation", "The 'Multi-Channel' Blitz (Days 1–5)", "The Selling Agent 'Intelligence Loop'", "The 'Pattern Interrupt' Cold Call", "The '2-Minute' Lead Qualification", "The 'Value-First' Appointment Set", "The 'Short-Term' Nurture & CRM Ghost Recovery"] },
                { id: 5, title: "The Buying Journey", topics: ["Lead Generation & Warm-Up (Multi-Channel Blitz)", "The Discovery Call (Qualification Framework)", "The 20-Question Discovery Checklist", "The Consultation (The 45-Min Deep Dive)", "The 25-Stage Consultation Checklist", "The Strategy Session (Post-FSA Signature)", "The 20-Question Strategy Questionnaire", "Professional Referrals: Solving Stalled Files"] },
                { id: 6, title: "Strategic Asset Isolation & The 76% Edge", topics: ["The 20-Point Strategic DNA Mapping", "The 76% Off-Market Extraction", "The 'Failed Settlement' Rescue Operations", "The Stalled Listing Hijack", "The Developer Pivot Logic", "Paddington/New Farm: The Vibe vs Variable", "Logan/Ipswich: Yield vs Dirt", "Sunshine Coast: The Downsizer Trap"] },
                { id: 7, title: "Building the B2B Authority Network", topics: ["The Accountant/Broker 'Fiduciary' Alignment", "Social Media & Authority Positioning", "Mining the 'Shadow Inventory'", "The Pre-Approval Expiry Loop", "Tax-Loss Prevention: Land vs Brick", "The 'Anatomy of a Reject' Post", "The Empty Nest Target", "The Investment Exit Strategy"] },
                { id: 8, title: "Lead Conversion Mastery", topics: ["The A.A.R.M. Objection Framework", "Selling with Your Authentic Self", "Eliminating Sales Breath", "The 'Doctor' Approach to Discovery", "Soft-Front, Hard-Back Tonality", "The Mirroring Technique", "Labeling Client Emotions", "The 'Negative' Question Strategy", "The Silence Gap Tactic"] },
                { id: 9, title: "Sales Masterclass (Objections 1)", topics: ["Objection: Your Fee is Too High", "Objection: I Can Do It Myself", "Handling the 'Discount' Request", "The ROI Case Study Presentation", "The Agent vs Agent Dynamic", "The Knowledge Gap Highlight", "The Access Gap (Portal Trap)", "The Due Diligence Checklist Close"] },
                { id: 10, title: "Sales Masterclass (Objections 2)", topics: ["Objection: The Market Timing Paralysis", "The Follow-Up Sequence (The Quantum Drip)", "Objection: We Want a 'Bargain'", "The Interest Rate Paradox", "The 'Priced Out' Danger Calculation", "The Rental Yield Loss Math", "The Stress Cost Confrontation", "The 'First Mover' Advantage"] },
                { id: 11, title: "Professional Standards & Wealth Engineering", topics: ["The Holy Grail: Trusts & Bucket Companies", "Capital & Risk Management", "Established Assets vs Build", "The 3-to-4 Bed Value-Add", "Zoning Warfare & Secondary Dwellings", "The Off-Market Engine", "The Inspection Protocol", "Weaponizing B&P Reports", "State Warfare (QLD)", "State Warfare (NSW)", "State Warfare (VIC)", "High-Stakes Negotiation", "Auction Dominance", "Stakeholder & Post-Settlement", "Quantum Mega-Certification Exam"] }
            ];

            window.flatItems = [];
            let globalId = 0;
            phaseStructure.forEach(phase => {
                phase.topics.forEach((topic, index) => {
                    const isLastInPhase = index === phase.topics.length - 1;
                    let desc, content, quiz;

                    if (coreIntelligence[topic]) {
                        desc = coreIntelligence[topic].desc;
                        content = coreIntelligence[topic].sections.map(s => `<h3 class="font-bold text-brand-900 text-lg mt-6 mb-3 flex items-center"><i data-lucide="${s.icon}" class="w-5 h-5 mr-2 text-brand-accent"></i>${s.heading}</h3><p class="text-slate-700 leading-relaxed mb-4">${s.content}</p>`).join('');
                        quiz = coreIntelligence[topic].quiz;
                    } else {
                        desc = `Mastery of ${topic} is critical to acting as a financial firewall for your clients.`;
                        content = `<h3 class="font-bold text-brand-900 text-lg mt-6 mb-3 flex items-center"><i data-lucide="shield" class="w-5 h-5 mr-2 text-brand-accent"></i>The Core Principle</h3><p class="text-slate-700 leading-relaxed mb-4">In the Quantum framework, ${topic} is not about sales; it is about risk mitigation.</p><h3 class="font-bold text-brand-900 text-lg mt-6 mb-3 flex items-center"><i data-lucide="crosshair" class="w-5 h-5 mr-2 text-brand-accent"></i>Tactical Execution</h3><p class="text-slate-700 leading-relaxed mb-4">You must rely entirely on data asymmetry. When discussing ${topic}, strip away all emotion. Present the client with the mathematical reality of their position.</p><h3 class="font-bold text-brand-900 text-lg mt-6 mb-3 flex items-center"><i data-lucide="alert-triangle" class="w-5 h-5 mr-2 text-brand-accent"></i>Warning</h3><p class="text-slate-700 leading-relaxed mb-4">Compromising on this standard destroys the Quantum Flywheel.</p>`;
                        quiz = { q: `How does Quantum approach ${topic}?`, options: ["With high emotional energy.", "By relying on data and mitigating risk.", "By relying on market trends and minimizing exposure.", "By outsourcing to a third party."], ans: 1, exp: "Risk mitigation is our primary directive." };
                    }

                    window.flatItems.push({
                        globalIdx: globalId++, phaseId: phase.id, phaseTitle: phase.title, title: topic, isLastInPhase: isLastInPhase,
                        desc: desc,
                        content: content,
                        quiz: quiz
                    });
                });
            });
        }

        // --- NAVIGATION & RENDERING ---
        window.switchTab = function (tab) {
            window.currentTab = tab;
            const activeClass = 'flex-1 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-colors bg-brand-accent text-white shadow-md';
            const inactiveClass = 'flex-1 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors';

            document.getElementById('tab-modules').className = tab === 'modules' ? activeClass : inactiveClass;
            document.getElementById('tab-highlights').className = tab === 'highlights' ? activeClass : inactiveClass;
            document.getElementById('tab-ailab').className = tab === 'ailab' ? activeClass : inactiveClass;
            document.getElementById('tab-admin').className = tab === 'admin' ? 'flex-1 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-colors bg-emerald-500 text-white shadow-md' : 'flex-1 py-2 rounded-lg text-[9px] font-bold uppercase tracking-wider text-emerald-400 hover:text-white transition-colors' + (window.userData.isAdmin ? '' : ' hidden');

            if (tab === 'admin') {
                document.getElementById('nav-container').innerHTML = '<div class="text-center text-slate-500 text-xs mt-10 p-4">Admin controls loaded in main window.</div>';
                document.getElementById('bottom-nav-bar').classList.add('hidden');
                renderAdminPanel();
            } else {
                document.getElementById('bottom-nav-bar').classList.remove('hidden');
                renderSidebar();
                if (tab === 'modules' || tab === 'highlights') renderPage();
            }
        }

        window.renderSidebar = function () {
            const container = document.getElementById('nav-container');
            let html = '';

            if (window.currentTab === 'modules') {
                let currentPhase = -1;

                window.flatItems.forEach((item) => {
                    // 1. Render Phase Headers
                    if (item.phaseId !== currentPhase) {
                        currentPhase = item.phaseId;
                        const isUnlocked = window.userData.isAdmin || window.userData.unlockedPhases.includes(currentPhase);
                        const lockIcon = isUnlocked ? '' : '<i data-lucide="lock" class="w-3 h-3 ml-2 inline text-slate-600"></i>';
                        html += `<div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-6 mb-2 ml-2 border-b border-slate-800 pb-1">Phase ${currentPhase}: ${item.phaseTitle} ${lockIcon}</div>`;
                    }

                    // 2. Render Module Buttons
                    const isUnlocked = window.userData.isAdmin || window.userData.unlockedPhases.includes(item.phaseId);
                    const isCompleted = window.userData.completedModules.includes(item.globalIdx);
                    const isActive = item.globalIdx === window.currentIndex;

                    let classes = 'w-full text-left flex items-start px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 ';
                    if (isActive) classes += 'bg-brand-accent text-white shadow-lg';
                    else if (isUnlocked) classes += 'text-slate-300 hover:bg-slate-800';
                    else classes += 'text-slate-600 cursor-not-allowed opacity-50';

                    const checkIcon = isCompleted ? '<i data-lucide="check-circle" class="w-4 h-4 text-brand-success ml-auto flex-shrink-0 mt-0.5"></i>' : '';

                    // REBUILT LOGIC: Cleanly assigning the navigation call without nested template strings
                    const clickAction = isUnlocked ? `onclick="navigateTo(${item.globalIdx})"` : `disabled="true"`;

                    html += `
                        <button ${clickAction} class="${classes}">
                            <span class="mr-2 opacity-50 text-[10px] mt-1">${item.globalIdx + 1}.</span>
                            <span class="flex-1 leading-snug">${item.title}</span>
                            ${checkIcon}
                        </button>
                    `;
                });

                // 3. Render Master Exam Button
                const allDone = window.flatItems.every(i => window.userData.completedModules.includes(i.globalIdx));
                if (window.userData.isAdmin || allDone) {
                    html += `<div class="mt-8 mb-4"><button onclick="openMasterExam()" class="w-full bg-yellow-500/20 text-yellow-500 border border-yellow-500/50 rounded-xl p-3 font-bold text-sm hover:bg-yellow-500 hover:text-white transition-all shadow-lg shadow-yellow-500/20"><i data-lucide="award" class="w-5 h-5 mx-auto mb-1"></i> Final Master Exam</button></div>`;
                }

            } else if (window.currentTab === 'highlights') {
                // Highlights Tab
                if (window.userData.favorites.length === 0) {
                    html = '<div class="text-center text-slate-500 text-xs mt-10 p-4">No highlights yet. Click the ⭐ icon on any module to save it here.</div>';
                } else {
                    window.userData.favorites.forEach(favIdx => {
                        const item = window.flatItems[favIdx];
                        html += `<button onclick="navigateTo(${item.globalIdx})" class="w-full text-left flex items-start px-3 py-3 mb-2 rounded-lg text-[13px] font-medium bg-slate-800 text-white hover:bg-slate-700 transition-colors border-l-2 border-yellow-500"><i data-lucide="star" class="w-4 h-4 text-yellow-500 mr-2 mt-0.5"></i><span class="flex-1">${item.title}</span></button>`;
                    });
                }
            } else if (window.currentTab === 'ailab') {
                // AI LAB Tools List
                html = `
                    <div class="p-2 space-y-3">
                        <button onclick="toggleAITool('lab')" class="w-full text-left p-4 rounded-xl border border-slate-700/50 bg-[#1e293b]/60 hover:bg-[#1e293b] hover:border-brand-accent/50 transition-all group">
                            <div class="flex items-center text-brand-accent font-bold text-sm mb-1"><i data-lucide="swords" class="w-4 h-4 mr-2"></i> Objection Lab ✨</div>
                            <p class="text-xs text-slate-400">Spar with virtual clients.</p>
                        </button>
                        <button onclick="toggleAITool('negotiation')" class="w-full text-left p-4 rounded-xl border border-slate-700/50 bg-[#1e293b]/60 hover:bg-[#1e293b] hover:border-brand-accent/50 transition-all group">
                            <div class="flex items-center text-purple-400 font-bold text-sm mb-1"><i data-lucide="crosshair" class="w-4 h-4 mr-2"></i> Negotiation Engine ✨</div>
                            <p class="text-xs text-slate-400">Craft aggressive offer strategies.</p>
                        </button>
                        <button onclick="toggleAITool('decoder')" class="w-full text-left p-4 rounded-xl border border-slate-700/50 bg-[#1e293b]/60 hover:bg-[#1e293b] hover:border-brand-accent/50 transition-all group">
                            <div class="flex items-center text-rose-400 font-bold text-sm mb-1"><i data-lucide="file-warning" class="w-4 h-4 mr-2"></i> Document Decoder ✨</div>
                            <p class="text-xs text-slate-400">Extract leverage from docs.</p>
                        </button>
                        <button onclick="toggleAITool('architect')" class="w-full text-left p-4 rounded-xl border border-slate-700/50 bg-[#1e293b]/60 hover:bg-[#1e293b] hover:border-brand-accent/50 transition-all group">
                            <div class="flex items-center text-orange-400 font-bold text-sm mb-1"><i data-lucide="send" class="w-4 h-4 mr-2"></i> Outreach Architect ✨</div>
                            <p class="text-xs text-slate-400">Pattern interrupt scripts.</p>
                        </button>
                        <button onclick="toggleAITool('auditor')" class="w-full text-left p-4 rounded-xl border border-slate-700/50 bg-[#1e293b]/60 hover:bg-[#1e293b] hover:border-brand-accent/50 transition-all group">
                            <div class="flex items-center text-blue-400 font-bold text-sm mb-1"><i data-lucide="search" class="w-4 h-4 mr-2"></i> Listing Auditor ✨</div>
                            <p class="text-xs text-slate-400">Scan for red flags.</p>
                        </button>
                        <button onclick="toggleAITool('profiler')" class="w-full text-left p-4 rounded-xl border border-slate-700/50 bg-[#1e293b]/60 hover:bg-[#1e293b] hover:border-brand-accent/50 transition-all group">
                            <div class="flex items-center text-teal-400 font-bold text-sm mb-1"><i data-lucide="user-minus" class="w-4 h-4 mr-2"></i> Agent Profiler ✨</div>
                            <p class="text-xs text-slate-400">Psych-profile selling agents.</p>
                        </button>
                        <button onclick="toggleAITool('autopsy')" class="w-full text-left p-4 rounded-xl border border-slate-700/50 bg-[#1e293b]/60 hover:bg-[#1e293b] hover:border-brand-accent/50 transition-all group">
                            <div class="flex items-center text-red-400 font-bold text-sm mb-1"><i data-lucide="activity" class="w-4 h-4 mr-2"></i> Deal Autopsy ✨</div>
                            <p class="text-xs text-slate-400">Post-mortem lost deals.</p>
                        </button>
                        <button onclick="toggleAITool('offmarket')" class="w-full text-left p-4 rounded-xl border border-slate-700/50 bg-[#1e293b]/60 hover:bg-[#1e293b] hover:border-brand-accent/50 transition-all group">
                            <div class="flex items-center text-indigo-400 font-bold text-sm mb-1"><i data-lucide="mail" class="w-4 h-4 mr-2"></i> Off-Market Engine ✨</div>
                            <p class="text-xs text-slate-400">Generate acquisition campaigns.</p>
                        </button>
                        <button onclick="toggleAITool('intervention')" class="w-full text-left p-4 rounded-xl border border-slate-700/50 bg-[#1e293b]/60 hover:bg-[#1e293b] hover:border-brand-accent/50 transition-all group">
                            <div class="flex items-center text-yellow-400 font-bold text-sm mb-1"><i data-lucide="shield-alert" class="w-4 h-4 mr-2"></i> Client Intervention ✨</div>
                            <p class="text-xs text-slate-400">Scripts to stop overpaying.</p>
                        </button>
                    </div>
                `;
            }
            container.innerHTML = html;
            lucide.createIcons();
        }

        window.navigateTo = function (index) {
            if (index < 0 || index >= window.flatItems.length) return;
            const item = window.flatItems[index];
            if (!window.userData.isAdmin && !window.userData.unlockedPhases.includes(item.phaseId)) return;

            window.currentIndex = index;
            window.renderSidebar();
            window.renderPage();
        }

        window.renderPage = function () {
            const item = window.flatItems[window.currentIndex];
            const contentDiv = document.getElementById('page-content');

            document.getElementById('header-category').innerText = `Phase ${item.phaseId}: ${item.phaseTitle}`;
            document.getElementById('header-module-title').innerText = `Module ${item.globalIdx + 1}`;

            // Stop any playing TTS audio when navigating away
            if (window.currentAudioPlayer) {
                window.currentAudioPlayer.pause();
                window.currentAudioPlayer = null;
                resetTTSButton();
            }

            const isFav = window.userData.favorites.includes(window.currentIndex);
            const favBtn = document.getElementById('favorite-btn');
            if (isFav) { favBtn.classList.add('text-yellow-500', 'bg-yellow-50'); favBtn.innerHTML = '<i data-lucide="star" class="w-5 h-5 fill-current"></i>'; }
            else { favBtn.classList.remove('text-yellow-500', 'bg-yellow-50'); favBtn.innerHTML = '<i data-lucide="star" class="w-5 h-5"></i>'; }

            const isUserCompleted = window.userData.completedModules.includes(window.currentIndex);
            const isCompleted = window.userData.isAdmin || isUserCompleted;

            let quizHtml = '';
            if (!isUserCompleted || window.userData.isAdmin) {
                // Shuffle Options dynamically so it's never always the second one
                const shuffledOptions = item.quiz.options.map((opt, idx) => ({ text: opt, idx: idx }));
                for (let i = shuffledOptions.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffledOptions[i], shuffledOptions[j]] = [shuffledOptions[j], shuffledOptions[i]];
                }

                quizHtml = `<div class="mt-12 bg-slate-50 rounded-2xl p-8 border border-slate-200">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-bold text-brand-900 flex items-center"><i data-lucide="brain-circuit" class="w-6 h-6 mr-2 text-brand-accent"></i> Validation Check (+10 💎)</h3>
                    ${window.userData.isAdmin ? '<span class="bg-purple-100 text-purple-700 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-widest">Admin Preview</span>' : ''}
                </div>
                <p class="font-semibold text-slate-800 mb-4">${item.quiz.q}</p>
                <div class="space-y-3">
                    ${shuffledOptions.map(optObj => `<button data-idx="${optObj.idx}" onclick="submitModuleQuiz(${optObj.idx}, ${item.quiz.ans}, this)" class="w-full text-left p-4 text-sm font-medium border border-slate-200 rounded-xl bg-white text-slate-600 hover:border-brand-accent hover:bg-blue-50 transition-all">${optObj.text}</button>`).join('')}
                </div><div id="quiz-feedback" class="hidden mt-4 p-4 rounded-lg text-sm font-bold"></div></div>`;

                if (isUserCompleted && window.userData.isAdmin) {
                    quizHtml += `<div class="mt-4 bg-emerald-50 text-emerald-700 p-4 rounded-xl border border-emerald-200 flex items-center"><i data-lucide="check-circle" class="w-5 h-5 mr-3 text-emerald-500"></i><p class="text-sm font-bold">Module is marked as completed in your profile.</p></div>`;
                }
            } else {
                quizHtml = `<div class="mt-12 bg-emerald-50 text-emerald-700 p-6 rounded-2xl border border-emerald-200 flex items-center"><i data-lucide="check-circle" class="w-8 h-8 mr-4 text-emerald-500"></i><div><p class="font-bold text-lg">Module Completed</p><p class="text-sm opacity-80">You have secured 10 💎 points for this module.</p></div></div>`;
            }

            // Phase Exam Trigger
            let phaseExamHtml = '';
            if (isCompleted && item.isLastInPhase && !window.userData.unlockedPhases.includes(item.phaseId + 1) && item.phaseId < 11 && !window.userData.isAdmin) {
                phaseExamHtml = `<div class="mt-8 bg-brand-900 p-8 rounded-2xl text-center shadow-xl"><h3 class="text-2xl font-serif font-bold text-white mb-2">Phase ${item.phaseId} Locked</h3><p class="text-slate-400 text-sm mb-6">You must pass the AI Phase Exam to unlock Phase ${item.phaseId + 1}.</p><button onclick="generatePhaseExam(${item.phaseId})" class="bg-brand-accent text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-blue-600 transition-colors inline-flex items-center"><i data-lucide="cpu" class="w-5 h-5 mr-2"></i> Initiate AI Phase Exam</button><div id="phase-exam-container" class="mt-6 text-left hidden bg-white rounded-xl p-6"></div></div>`;
            }

            contentDiv.innerHTML = `
                <div class="animate-fade-in mb-10">
                    <span class="inline-block px-3 py-1 bg-slate-800 text-white text-[10px] font-bold tracking-widest uppercase rounded-full mb-4">Module ${item.globalIdx + 1}</span>
                    <h1 class="font-serif text-4xl font-bold text-brand-900 leading-tight mb-4">${item.title}</h1>
                    <p class="text-lg text-slate-500 border-l-4 border-brand-accent pl-4">${item.desc}</p>
                </div>
                <div class="text-[15px] text-slate-700 leading-relaxed whitespace-pre-line">${item.content}</div>
                ${quizHtml}
                ${phaseExamHtml}
            `;

            document.getElementById('prev-btn').disabled = window.currentIndex === 0;
            document.getElementById('next-btn').disabled = !(isCompleted || window.userData.isAdmin) || (item.isLastInPhase && !window.userData.unlockedPhases.includes(item.phaseId + 1) && !window.userData.isAdmin);

            lucide.createIcons();
        }

        // --- ADMIN MODULE EDITING LOGIC ---
        window.openEditModule = function () {
            const item = window.flatItems[window.currentIndex];
            const contentDiv = document.getElementById('page-content');

            contentDiv.innerHTML = `
                <div class="animate-fade-in bg-white border border-emerald-200 rounded-2xl p-8 shadow-lg">
                    <h2 class="text-2xl font-bold text-emerald-700 mb-6 flex items-center"><i data-lucide="edit-3" class="w-6 h-6 mr-2"></i> Edit Module Content</h2>
                    
                    <div class="space-y-5">
                        <div>
                            <label class="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Module Title</label>
                            <input id="edit-title" type="text" value="${item.title}" class="w-full p-3 border border-slate-200 rounded-lg outline-none focus:border-emerald-500">
                        </div>
                        <div>
                            <label class="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Short Description (Subheading)</label>
                            <input id="edit-desc" type="text" value="${item.desc}" class="w-full p-3 border border-slate-200 rounded-lg outline-none focus:border-emerald-500">
                        </div>
                        <div>
                            <label class="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Main Content (HTML allowed)</label>
                            <textarea id="edit-content" class="w-full p-4 border border-slate-200 rounded-xl outline-none focus:border-emerald-500 h-64 font-mono text-sm leading-relaxed">${item.content}</textarea>
                        </div>
                        
                        <div class="bg-slate-50 p-6 rounded-xl border border-slate-200 mt-6">
                            <h3 class="font-bold text-brand-900 mb-4">Quiz Data</h3>
                            <label class="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Question</label>
                            <input id="edit-quiz-q" type="text" value="${item.quiz.q}" class="w-full p-3 border border-slate-200 rounded-lg outline-none focus:border-brand-accent mb-4">
                            
                            <label class="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Options (Comma separated)</label>
                            <input id="edit-quiz-opts" type="text" value="${item.quiz.options.join(', ')}" class="w-full p-3 border border-slate-200 rounded-lg outline-none focus:border-brand-accent mb-4">
                            
                            <label class="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">Correct Answer Index (0, 1, or 2)</label>
                            <input id="edit-quiz-ans" type="number" min="0" max="10" value="${item.quiz.ans}" class="w-full p-3 border border-slate-200 rounded-lg outline-none focus:border-brand-accent mb-4">
                        </div>
                    </div>
                    
                    <div class="mt-8 flex justify-end space-x-3">
                        <button onclick="renderPage()" class="px-6 py-3 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">Cancel</button>
                        <button onclick="saveEditedModule()" class="bg-emerald-600 text-white px-8 py-3 rounded-xl font-bold shadow-md hover:bg-emerald-700 transition-colors flex items-center">
                            <i data-lucide="save" class="w-5 h-5 mr-2"></i> Save Changes to Cloud
                        </button>
                    </div>
                </div>
            `;
            lucide.createIcons();
        }

        window.saveEditedModule = async function () {
            const item = window.flatItems[window.currentIndex];

            // Update local object
            item.title = document.getElementById('edit-title').value;
            item.desc = document.getElementById('edit-desc').value;
            item.content = document.getElementById('edit-content').value;
            item.quiz.q = document.getElementById('edit-quiz-q').value;
            item.quiz.options = document.getElementById('edit-quiz-opts').value.split(',').map(s => s.trim());
            item.quiz.ans = parseInt(document.getElementById('edit-quiz-ans').value);

            // Push entire array to DB
            try {
                const modulesDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'course', 'modules_list');
                await setDoc(modulesDocRef, { items: window.flatItems });

                renderSidebar(); // Refresh title in sidebar
                renderPage(); // View updated content
            } catch (e) {
                console.error("Failed to save edited module", e);
                alert("Database save failed.");
            }
        }

        window.renderAdminPanel = async function () {
            const contentDiv = document.getElementById('page-content');
            document.getElementById('header-category').innerText = 'Admin';
            document.getElementById('header-module-title').innerText = 'Control Center 🛡️';

            contentDiv.innerHTML = `<div class="animate-fade-in"><h1 class="font-serif text-4xl font-bold text-brand-900 mb-2">Trainee Analytics Hub</h1><p class="text-slate-500 mb-8">Review agent progression and generate AI coaching insights.</p><div id="admin-users-container" class="text-slate-500 flex items-center"><div class="typing-dot mr-1"></div> Fetching user data...</div></div>`;

            try {
                const traineesRef = collection(db, 'artifacts', appId, 'public', 'data', 'trainees');
                const snapshot = await getDocs(traineesRef);

                let usersHtml = '<div class="grid grid-cols-1 md:grid-cols-2 gap-6">';
                let count = 0;

                snapshot.forEach(docSnap => {
                    const u = docSnap.data();
                    const uid = docSnap.id;
                    if (u.isAdmin) return; // Skip showing other admins in the review panel
                    count++;

                    const totalModules = window.flatItems ? window.flatItems.length : 85;
                    const completed = u.completedModules ? u.completedModules.length : 0;
                    const percent = Math.round((completed / totalModules) * 100) || 0;

                    // Format data securely for the click handler
                    const uDataSafe = encodeURIComponent(JSON.stringify(u));

                    usersHtml += `
                    <div onclick="openUserAnalytics('${uDataSafe}')" class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 relative overflow-hidden flex flex-col cursor-pointer hover:shadow-md hover:border-brand-accent/50 transition-all group">
                        <div class="absolute top-0 left-0 w-full h-1 bg-emerald-500 group-hover:bg-brand-accent transition-colors"></div>
                        <div class="flex justify-between items-start mb-4">
                            <div>
                                <h3 class="font-bold text-lg text-brand-900 group-hover:text-brand-accent transition-colors">${u.firstName} ${u.lastName}</h3>
                                <p class="text-xs text-slate-500 uppercase tracking-widest font-bold mt-1">${u.role || 'Agent'}</p>
                                <p class="text-xs text-slate-400 mt-1">${u.email}</p>
                            </div>
                            <div class="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg text-sm font-bold shadow-sm">${u.points || 0} 💎</div>
                        </div>
                        
                        <div class="mb-5 flex-1">
                            <div class="flex justify-between text-xs mb-1">
                                <span class="font-bold text-slate-700">Mastery Progress</span>
                                <span class="text-emerald-600 font-bold">${percent}% (${completed}/${totalModules})</span>
                            </div>
                            <div class="w-full bg-slate-100 rounded-full h-2">
                                <div class="bg-emerald-500 h-2 rounded-full" style="width: ${percent}%"></div>
                            </div>
                        </div>
                        
                        <div class="text-xs font-bold text-brand-accent flex items-center mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            View Full Analytics <i data-lucide="arrow-right" class="w-3 h-3 ml-1"></i>
                        </div>
                    </div>`;
                });
                usersHtml += '</div>';

                if (count === 0) usersHtml = `<div class="bg-slate-50 border border-slate-200 p-8 rounded-2xl text-center text-slate-500">No trainee records found yet. Users will appear here once they register.</div>`;

                document.getElementById('admin-users-container').innerHTML = usersHtml;
                lucide.createIcons();
            } catch (err) {
                console.error(err);
                document.getElementById('admin-users-container').innerHTML = "<p class='text-red-500'>Error loading users. Ensure Firebase is connected properly.</p>";
            }
        }

        // --- ADMIN ANALYTICS & CHARTS ---
        let progressChartInstance = null;
        let activityChartInstance = null;
        let auditChartInstance = null;
        let offmarketChartInstance = null;
        let interventionChartInstance = null;

        window.openUserAnalytics = function (encodedUserData) {
            const u = JSON.parse(decodeURIComponent(encodedUserData));
            const modal = document.getElementById('admin-analytics-modal');

            // Populate Text Stats
            document.getElementById('analytics-user-name').innerText = `${u.firstName} ${u.lastName} - ${u.role || 'Agent'}`;
            document.getElementById('analytics-points').innerText = `${u.points || 0} 💎`;
            document.getElementById('analytics-phases').innerText = `${u.unlockedPhases ? Math.max(...u.unlockedPhases) : 1} / 11`;

            let gradeText = "Not Taken";
            if (u.examGrade) {
                gradeText = `${u.examGrade} (${Math.round(u.examPercentage)}%)`;
                document.getElementById('analytics-exam-grade').className = `text-3xl font-bold ${u.examPassed ? 'text-emerald-600' : 'text-red-600'}`;
            } else {
                document.getElementById('analytics-exam-grade').className = 'text-3xl font-bold text-slate-400';
            }
            document.getElementById('analytics-exam-grade').innerText = gradeText;

            // Prepare Chart Data
            const totalModules = window.flatItems ? window.flatItems.length : 85;
            const completedModules = u.completedModules ? u.completedModules.length : 0;
            const incompleteModules = totalModules - completedModules;

            // Render Doughnut Chart (Progress)
            const ctxProgress = document.getElementById('progressChart').getContext('2d');
            if (progressChartInstance) progressChartInstance.destroy();
            progressChartInstance = new Chart(ctxProgress, {
                type: 'doughnut',
                data: {
                    labels: ['Completed', 'Remaining'],
                    datasets: [{
                        data: [completedModules, incompleteModules],
                        backgroundColor: ['#22c55e', '#e2e8f0'],
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { position: 'bottom' } } }
            });

            // Process Login History for Last 7 Days
            const logins = u.loginHistory || [];
            const last7Days = [];
            const loginCounts = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().split('T')[0];
                last7Days.push(d.toLocaleDateString('en-US', { weekday: 'short' }));

                const count = logins.filter(isoStr => isoStr.startsWith(dateStr)).length;
                loginCounts.push(count);
            }

            // Render Line Chart (Activity)
            const ctxActivity = document.getElementById('activityChart').getContext('2d');
            if (activityChartInstance) activityChartInstance.destroy();
            activityChartInstance = new Chart(ctxActivity, {
                type: 'line',
                data: {
                    labels: last7Days,
                    datasets: [{
                        label: 'Logins',
                        data: loginCounts,
                        fill: true,
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderColor: '#3b82f6',
                        tension: 0.4,
                        borderWidth: 2,
                        pointBackgroundColor: '#3b82f6'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
                    plugins: { legend: { display: false } }
                }
            });

            // Reset AI Insight Box
            const insightBtn = document.getElementById('generate-deep-insight-btn');
            const insightContainer = document.getElementById('deep-insight-container');
            insightContainer.classList.add('hidden');
            insightContainer.innerHTML = '';

            // Attach specific user data to the generation button
            insightBtn.onclick = () => generateDeepInsight(u, completedModules, totalModules);
            insightBtn.innerHTML = `Generate Deep Analysis ✨`;
            insightBtn.disabled = false;

            modal.classList.remove('hidden');
            lucide.createIcons();
        }

        window.generateDeepInsight = async function (u, completed, total) {
            const btn = document.getElementById('generate-deep-insight-btn');
            const container = document.getElementById('deep-insight-container');

            btn.innerHTML = `<span class="flex items-center"><div class="typing-dot mr-1 bg-white"></div><div class="typing-dot mr-1 bg-white"></div><div class="typing-dot bg-white"></div></span>`;
            btn.disabled = true;

            const percent = Math.round((completed / total) * 100) || 0;
            const loginCount = (u.loginHistory || []).length;
            const examDetails = u.examGrade ? `Final Exam Score: ${u.examScore}/60 (${Math.round(u.examPercentage)}% - ${u.examGrade}). Passed: ${u.examPassed}` : "Has not attempted the Final Master Exam yet.";

            const sys = "You are the Elite Performance Director at Quantum BA. You are analyzing an agent's LMS telemetry. Structure your response perfectly in 3 sections: '⚡ PERFORMANCE SUMMARY', '🛡️ TACTICAL STRENGTHS', and '🎯 REQUIRED COACHING INTERVENTION'. Base your analysis on their completion percentage, login frequency, and exam scores (if any). Do not use markdown backticks. Use a strict, highly professional Quantum tone.";
            const prompt = `Agent: ${u.firstName} ${u.lastName} (${u.role})\nCurriculum Progress: ${percent}% (${completed}/${total} modules)\nTotal Platform Logins: ${loginCount}\n${examDetails}\nProvide the deep analytical review.`;

            const res = await window.callGemini(prompt, sys);

            container.innerHTML = res.replace(/\n/g, '<br>');
            container.classList.remove('hidden');

            btn.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4 mr-2 text-white"></i> Analysis Complete`;
            lucide.createIcons();
        }

        window.submitModuleQuiz = async function (selected, correct, btnEl) {
            const feedback = document.getElementById('quiz-feedback');
            const btns = btnEl.parentElement.querySelectorAll('button');
            btns.forEach(b => {
                b.disabled = true;
                // Highlight the correct answer universally based on its real index
                if (parseInt(b.getAttribute('data-idx')) === correct) {
                    b.classList.remove('text-slate-600', 'bg-white');
                    b.classList.add('bg-emerald-50', 'border-emerald-500', 'text-emerald-700');
                }
            });

            if (selected === correct) {
                feedback.innerHTML = "Correct! +10 Points 💎";
                feedback.className = "mt-4 p-4 rounded-lg text-sm font-bold bg-emerald-100 text-emerald-800";

                if (!window.userData.completedModules.includes(window.currentIndex)) {
                    window.userData.completedModules.push(window.currentIndex);
                    window.userData.points += 10;
                    await saveUserData();
                    setTimeout(() => renderPage(), 1000);
                }
            } else {
                // Highlight the wrong answer they clicked
                btnEl.classList.remove('bg-white');
                btnEl.classList.add('bg-red-50', 'border-red-500', 'text-red-700');
                feedback.innerHTML = "Incorrect. Review the material and try again.";
                feedback.className = "mt-4 p-4 rounded-lg text-sm font-bold bg-red-100 text-red-800";
                setTimeout(() => renderPage(), 2000); // Reset
            }
        }

        window.toggleFavorite = async function () {
            const idx = window.userData.favorites.indexOf(window.currentIndex);
            if (idx > -1) window.userData.favorites.splice(idx, 1);
            else window.userData.favorites.push(window.currentIndex);
            await saveUserData();
            renderPage();
            renderSidebar();
        }

        // --- AI TOOLS & GAMIFICATION ---
        window.closeAllModals = function () {
            document.getElementById('ai-lab-modal')?.classList.add('hidden');
            document.getElementById('ai-mentor-modal')?.classList.add('hidden');
            document.getElementById('ai-architect-modal')?.classList.add('hidden');
            document.getElementById('ai-auditor-modal')?.classList.add('hidden');
            document.getElementById('ai-negotiation-modal')?.classList.add('hidden');
            document.getElementById('ai-decoder-modal')?.classList.add('hidden');
            document.getElementById('ai-profiler-modal')?.classList.add('hidden');
            document.getElementById('ai-autopsy-modal')?.classList.add('hidden');
            document.getElementById('ai-offmarket-modal')?.classList.add('hidden');
            document.getElementById('ai-intervention-modal')?.classList.add('hidden');
            document.getElementById('admin-analytics-modal')?.classList.add('hidden');

            // Stop Sparring Audio if playing
            if (window.sparringAudioPlayer) {
                window.sparringAudioPlayer.pause();
                window.sparringAudioPlayer = null;
            }
        }

        window.toggleAITool = function (tool) {
            const el = document.getElementById(`ai-${tool}-modal`);
            const isHidden = el ? el.classList.contains('hidden') : true;

            window.closeAllModals();

            if (tool && isHidden) {
                el.classList.remove('hidden');
                if (tool === 'lab') {
                    renderSparringMenu();
                }
            }
        }

        // --- NEW: GEMINI TEXT-TO-SPEECH (AUDIO MENTOR) ---
        window.currentAudioPlayer = null;

        function resetTTSButton() {
            const btn = document.getElementById('tts-btn');
            const icon = document.getElementById('tts-icon');
            const txt = document.getElementById('tts-text');
            if (btn && icon && txt) {
                btn.className = 'flex items-center justify-center px-4 py-2 rounded-lg text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition-colors border border-indigo-200 text-xs font-bold';
                icon.setAttribute('data-lucide', 'headphones');
                txt.innerText = 'Play Audio ✨';
                lucide.createIcons();
            }
        }

        window.playModuleAudio = async function () {
            const btn = document.getElementById('tts-btn');
            const icon = document.getElementById('tts-icon');
            const txt = document.getElementById('tts-text');

            // Toggle pause if already playing
            if (window.currentAudioPlayer) {
                if (!window.currentAudioPlayer.paused) {
                    window.currentAudioPlayer.pause();
                    icon.setAttribute('data-lucide', 'play');
                    txt.innerText = 'Resume Audio';
                    lucide.createIcons();
                    return;
                } else {
                    window.currentAudioPlayer.play();
                    icon.setAttribute('data-lucide', 'pause');
                    txt.innerText = 'Pause Audio';
                    lucide.createIcons();
                    return;
                }
            }

            // Start new generation
            btn.className = 'flex items-center justify-center px-4 py-2 rounded-lg text-white bg-indigo-600 border border-indigo-700 text-xs font-bold cursor-wait';
            icon.setAttribute('data-lucide', 'loader');
            icon.classList.add('animate-spin');
            txt.innerText = 'Generating Voice...';
            lucide.createIcons();

            const item = window.flatItems[window.currentIndex];
            // Clean HTML tags from content to make it readable
            const cleanContent = item.content.replace(/<[^>]*>?/gm, '');
            const textToSpeak = `Module: ${item.title}. ${item.desc}. ${cleanContent}`;

            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;
            const payload = {
                contents: [{ parts: [{ text: textToSpeak }] }],
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Fenrir" } } } // Fenrir voice for authoritative tone
                }
            };

            try {
                const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const result = await response.json();

                if (result.candidates && result.candidates[0].content.parts[0].inlineData) {
                    const inlineData = result.candidates[0].content.parts[0].inlineData;
                    const sampleRateMatch = inlineData.mimeType.match(/rate=(\d+)/);
                    const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1]) : 24000;

                    // Convert base64 PCM to ArrayBuffer
                    const binaryString = window.atob(inlineData.data);
                    const pcmBuffer = new ArrayBuffer(binaryString.length);
                    const view = new Uint8Array(pcmBuffer);
                    for (let i = 0; i < binaryString.length; i++) {
                        view[i] = binaryString.charCodeAt(i);
                    }

                    // Create WAV File in Memory
                    const numChannels = 1;
                    const bitsPerSample = 16;
                    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
                    const blockAlign = numChannels * (bitsPerSample / 8);
                    const dataSize = pcmBuffer.byteLength;
                    const wavBuffer = new ArrayBuffer(44 + dataSize);
                    const wavView = new DataView(wavBuffer);
                    const writeStr = (offset, string) => { for (let i = 0; i < string.length; i++) wavView.setUint8(offset + i, string.charCodeAt(i)); };

                    writeStr(0, 'RIFF');
                    wavView.setUint32(4, 36 + dataSize, true);
                    writeStr(8, 'WAVE');
                    writeStr(12, 'fmt ');
                    wavView.setUint32(16, 16, true);
                    wavView.setUint16(20, 1, true);
                    wavView.setUint16(22, numChannels, true);
                    wavView.setUint32(24, sampleRate, true);
                    wavView.setUint32(28, byteRate, true);
                    wavView.setUint16(32, blockAlign, true);
                    wavView.setUint16(34, bitsPerSample, true);
                    writeStr(36, 'data');
                    wavView.setUint32(40, dataSize, true);

                    const pcmDataView = new Uint8Array(pcmBuffer);
                    const outDataView = new Uint8Array(wavBuffer, 44);
                    outDataView.set(pcmDataView);

                    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
                    const audioUrl = URL.createObjectURL(blob);

                    window.currentAudioPlayer = new Audio(audioUrl);
                    window.currentAudioPlayer.onended = resetTTSButton;
                    window.currentAudioPlayer.play();

                    btn.className = 'flex items-center justify-center px-4 py-2 rounded-lg text-white bg-indigo-600 border border-indigo-700 text-xs font-bold';
                    icon.classList.remove('animate-spin');
                    icon.setAttribute('data-lucide', 'pause');
                    txt.innerText = 'Pause Audio';
                    lucide.createIcons();
                } else {
                    throw new Error("No audio data returned");
                }
            } catch (e) {
                console.error("TTS Error:", e);
                resetTTSButton();
                alert("Failed to generate audio. Please try again.");
            }
        }

        // --- NEW: DOCUMENT DECODER LOGIC ---
        window.generateDecode = async function () {
            const type = document.getElementById('decode-type').value;
            const input = document.getElementById('decode-input').value;
            const output = document.getElementById('decoder-output');
            const emptyState = document.getElementById('decoder-empty-state');

            if (!input.trim()) return;

            emptyState.classList.add('hidden');
            output.classList.remove('hidden');
            output.innerHTML = `<div class="flex flex-col items-center justify-center py-20 text-rose-600"><i data-lucide="scan-line" class="w-10 h-10 mb-4 animate-pulse"></i><div class="flex items-center mb-2"><div class="typing-dot mr-1 bg-current"></div><div class="typing-dot mr-1 bg-current"></div><div class="typing-dot bg-current"></div></div><p class="text-sm font-bold uppercase tracking-widest text-slate-400 mt-2">Decoding Legal/Technical Data...</p></div>`;
            lucide.createIcons();

            const sys = `You are the Quantum Document Decoder. You translate dense, boring, or complex real estate documents into raw, actionable leverage for a Buyer's Agent.
            
            Format STRICTLY with these Markdown headings:
            ### 🚨 TL;DR Risk Summary
            (A brutal, 2-sentence summary of the actual risk hidden in this document).
            
            ### 💸 Financial Red Flags (The Cash Traps)
            (Identify upcoming levies, hidden repair costs, bad clauses. Estimate the financial impact in dollars if possible).
            
            ### 🗡️ Tactical Negotiation Leverage
            (Give the agent exactly what to say to the selling agent to use these findings to smash the price down or alter the contract terms).`;

            const prompt = `Document Type: ${type}\n\nDocument Text:\n${input}`;

            try {
                const res = await window.callGemini(prompt, sys);

                let formattedHtml = res
                    .replace(/###\s(.*?)\n/g, '<h3 class="text-[15px] font-bold text-rose-900 mt-6 mb-4 pb-2 border-b border-rose-100 uppercase tracking-wider flex items-center"><i data-lucide="alert-triangle" class="w-4 h-4 mr-2 text-rose-500"></i> $1</h3>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-900">$1</strong>')
                    .replace(/\n/g, '<br>');

                output.innerHTML = formattedHtml;
            } catch (error) {
                output.innerHTML = `<div class="text-red-500 font-bold p-4 bg-red-50 rounded-xl border border-red-200">Error decoding document. Please try again.</div>`;
            }
            lucide.createIcons();
        }

        // --- NEW: SELLING AGENT PROFILER ---
        window.generateAgentProfile = async function () {
            const name = document.getElementById('profiler-name').value;
            const notes = document.getElementById('profiler-notes').value;
            const output = document.getElementById('profiler-output');
            const emptyState = document.getElementById('profiler-empty-state');

            if (!notes.trim()) return;

            emptyState.classList.add('hidden');
            output.classList.remove('hidden');
            output.innerHTML = `<div class="flex flex-col items-center justify-center py-20 text-teal-600"><i data-lucide="brain" class="w-10 h-10 mb-4 animate-pulse"></i><div class="flex items-center mb-2"><div class="typing-dot mr-1 bg-current"></div><div class="typing-dot mr-1 bg-current"></div><div class="typing-dot bg-current"></div></div><p class="text-sm font-bold uppercase tracking-widest text-slate-400 mt-2">Computing Psychological Profile...</p></div>`;
            lucide.createIcons();

            const sys = `You are a Quantum BA psychological profiler. Analyze the selling agent's behavior to uncover how to manipulate and defeat them in negotiation.
            
            Format STRICTLY with these Markdown headings:
            ### 🎭 Agent Archetype 
            (Assign them a persona, e.g., 'The Bluffer', 'The Lazy Closer', 'The Egotist', and explain why).
            
            ### 📉 Primary Weaknesses
            (What is this specific agent's psychological blind spot based on the notes? E.g., Will they fold if you push back? Do they need to feel like they won?).
            
            ### ⚔️ Rules of Engagement
            (Give 3 highly specific, actionable rules the Buyer's Agent MUST follow when negotiating with this agent to strip away their power).`;

            const prompt = `Agent Info: ${name}\nObserved Behavior: ${notes}`;

            try {
                const res = await window.callGemini(prompt, sys);
                let formattedHtml = res
                    .replace(/###\s(.*?)\n/g, '<h3 class="text-[15px] font-bold text-teal-900 mt-6 mb-4 pb-2 border-b border-teal-100 uppercase tracking-wider flex items-center"><i data-lucide="crosshair" class="w-4 h-4 mr-2 text-teal-500"></i> $1</h3>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-900">$1</strong>')
                    .replace(/\n/g, '<br>');
                output.innerHTML = formattedHtml;
            } catch (error) {
                output.innerHTML = `<div class="text-red-500 font-bold p-4 bg-red-50 rounded-xl border border-red-200">Error generating profile.</div>`;
            }
            lucide.createIcons();
        }

        // --- NEW: DEAL AUTOPSY ---
        window.generateAutopsy = async function () {
            const context = document.getElementById('autopsy-context').value;
            const output = document.getElementById('autopsy-output');
            const emptyState = document.getElementById('autopsy-empty-state');

            if (!context.trim()) return;

            emptyState.classList.add('hidden');
            output.classList.remove('hidden');
            output.innerHTML = `<div class="flex flex-col items-center justify-center py-20 text-red-600"><i data-lucide="stethoscope" class="w-10 h-10 mb-4 animate-pulse"></i><div class="flex items-center mb-2"><div class="typing-dot mr-1 bg-current"></div><div class="typing-dot mr-1 bg-current"></div><div class="typing-dot bg-current"></div></div><p class="text-sm font-bold uppercase tracking-widest text-slate-400 mt-2">Running Deal Post-Mortem...</p></div>`;
            lucide.createIcons();

            const sys = `You are the Quantum BA Performance Director. Analyze this lost deal. Give brutal, objective feedback. Do not comfort the agent. Break down exactly where they failed.
            
            Format STRICTLY with these Markdown headings:
            ### 🩸 Cause of Death
            (A blunt explanation of why the deal was actually lost. Did they misread motivation? Fail to build rapport? Bluff when they shouldn't have?).
            
            ### 🛑 Violated Quantum Principles
            (Which core concept did the BA fail to execute properly?).
            
            ### 🔄 Corrective Action
            (What is the exact tactical adjustment the BA must make next time they are in this situation?).`;

            const prompt = `Lost Deal Context: ${context}`;

            try {
                const res = await window.callGemini(prompt, sys);
                let formattedHtml = res
                    .replace(/###\s(.*?)\n/g, '<h3 class="text-[15px] font-bold text-red-900 mt-6 mb-4 pb-2 border-b border-red-100 uppercase tracking-wider flex items-center"><i data-lucide="activity" class="w-4 h-4 mr-2 text-red-500"></i> $1</h3>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-900">$1</strong>')
                    .replace(/\n/g, '<br>');
                output.innerHTML = formattedHtml;
            } catch (error) {
                output.innerHTML = `<div class="text-red-500 font-bold p-4 bg-red-50 rounded-xl border border-red-200">Error generating autopsy.</div>`;
            }
            lucide.createIcons();
        }

        // --- NEW: OFF-MARKET ENGINE (ULTIMATE) ---
        window.generateOffMarketCampaign = async function () {
            const suburb = document.getElementById('offmarket-suburb').value;
            const specs = document.getElementById('offmarket-specs').value;
            const budget = document.getElementById('offmarket-budget').value;
            const demo = document.getElementById('offmarket-demo').value;
            const hook = document.getElementById('offmarket-hook').value;
            const brief = document.getElementById('offmarket-brief').value;

            const output = document.getElementById('offmarket-output');
            const emptyState = document.getElementById('offmarket-empty-state');
            const scrollContainer = document.getElementById('offmarket-scroll-container');
            const chartWrapper = document.getElementById('offmarket-chart-wrapper');

            if (!suburb.trim() || !specs.trim()) { alert("Suburb and Property Specs are required."); return; }

            emptyState.classList.add('hidden');
            scrollContainer.classList.remove('hidden');
            chartWrapper.classList.add('hidden');
            output.classList.remove('hidden');

            output.innerHTML = `<div class="flex flex-col items-center justify-center py-20 text-indigo-600"><i data-lucide="rocket" class="w-10 h-10 mb-4 animate-pulse"></i><div class="flex items-center mb-2"><div class="typing-dot mr-1 bg-current"></div><div class="typing-dot mr-1 bg-current"></div><div class="typing-dot bg-current"></div></div><p class="text-sm font-bold uppercase tracking-widest text-slate-400 mt-2">Computing Campaign Matrix & Probability...</p></div>`;
            lucide.createIcons();

            const sys = `You are the Elite Off-Market Acquisition Director for Quantum BA. Your job is to extract hidden property inventory before it hits the open market.
            
            Based on the inputs, design a MASSIVE, highly comprehensive extraction campaign.
            
            Format STRICTLY with these Markdown headings:
            ### 📬 The Golden Letter (Direct Mail)
            (Write a hyper-targeted, high-converting letterbox drop specifically for this demographic. Factor in the buyer's "Hook" to create immense urgency. NO generic fluff).
            
            ### 📱 Targeted Social Ad Blueprint
            (Write a punchy Facebook/Instagram ad. Define the exact audience targeting settings (Age, Radius, Behaviors) and the Ad Copy).
            
            ### 📞 The Tactical Door-Knock Script
            (Provide a conversational script for door-knocking specific streets. Include the 'Opening', 'The Value Prop', and 'The Soft Exit' to bypass the immediate 'not selling' reflex).
            
            ### 🤝 B2B 'Shadow Inventory' Email
            (An email to local accountants/brokers asking if they have clients fitting this demographic who need to liquidate quietly, leveraging the specific Budget and Hook).

            CRITICAL REQUIREMENT:
            At the VERY END, you MUST output a JSON block wrapped in ~~JSON_CHART~~ and ~~END_JSON~~ evaluating the probability of success for each channel based on the chosen demographic.
            Example:
            ~~JSON_CHART~~
            {"labels": ["Direct Mail", "Door Knocking", "Social Ads", "B2B Network"], "scores": [85, 40, 60, 90]}
            ~~END_JSON~~
            Scores must be realistic percentages (0-100) reflecting how likely this channel is to acquire this specific target demographic.`;

            const prompt = `
            Target Geography: ${suburb}
            Asset Specs: ${specs}
            Budget Cap: ${budget}
            Target Demographic: ${demo}
            The Client 'Hook' / Leverage: ${hook}
            Specific Focus / Context: ${brief}
            `;

            try {
                const res = await window.callGemini(prompt, sys);

                // Extract JSON Chart
                let chartLabels = ["Direct Mail", "Door Knocking", "Social Ads", "B2B Network"];
                let chartScores = [50, 50, 50, 50];
                let cleanText = res;

                const jsonMatch = res.match(/~~JSON_CHART~~\s*(\{.*?\})\s*~~END_JSON~~/is);
                if (jsonMatch && jsonMatch[1]) {
                    try {
                        const parsed = JSON.parse(jsonMatch[1]);
                        if (parsed.labels && parsed.scores) {
                            chartLabels = parsed.labels;
                            chartScores = parsed.scores;
                        }
                        cleanText = res.replace(/~~JSON_CHART~~.*?~~END_JSON~~/is, '');
                    } catch (e) { console.warn("Failed parsing chart JSON"); }
                }

                let formattedHtml = cleanText
                    .replace(/###\s(.*?)\n/g, '<h3 class="text-[16px] font-bold text-indigo-900 mt-8 mb-4 pb-2 border-b border-indigo-100 uppercase tracking-wider flex items-center"><i data-lucide="crosshair" class="w-5 h-5 mr-2 text-indigo-500"></i> $1</h3>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-900">$1</strong>')
                    .replace(/\n/g, '<br>');

                output.innerHTML = formattedHtml;

                // Render Chart
                chartWrapper.classList.remove('hidden');
                const ctx = document.getElementById('offmarketChart').getContext('2d');
                if (offmarketChartInstance) offmarketChartInstance.destroy();

                offmarketChartInstance = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: chartLabels,
                        datasets: [{
                            label: 'Channel Conversion Probability (%)',
                            data: chartScores,
                            backgroundColor: 'rgba(79, 70, 229, 0.8)',
                            borderRadius: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: { y: { beginAtZero: true, max: 100 } },
                        plugins: {
                            legend: { display: false },
                            title: { display: true, text: 'Simulated Channel Effectiveness for this Demographic' }
                        }
                    }
                });

            } catch (error) {
                output.innerHTML = `<div class="text-red-500 font-bold p-4 bg-red-50 rounded-xl border border-red-200">Error generating campaign.</div>`;
            }
            lucide.createIcons();
        }

        // --- NEW: CLIENT INTERVENTION SHIELD (ULTIMATE) ---
        window.generateIntervention = async function () {
            const address = document.getElementById('intervene-address').value;
            const intrinsicStr = document.getElementById('intervene-value').value;
            const offerStr = document.getElementById('intervene-offer').value;
            const compOffers = document.getElementById('intervene-comp').value;
            const lvrRisk = document.getElementById('intervene-lvr').value;
            const context = document.getElementById('intervene-context').value;

            const output = document.getElementById('intervention-output');
            const emptyState = document.getElementById('intervention-empty-state');
            const scrollContainer = document.getElementById('intervention-scroll-container');
            const chartWrapper = document.getElementById('intervention-chart-wrapper');

            if (!intrinsicStr || !offerStr || !context.trim()) { alert("Value, Offer, and Context are required."); return; }

            const intrinsicVal = parseInt(intrinsicStr.replace(/\D/g, ''));
            const offerVal = parseInt(offerStr.replace(/\D/g, ''));

            emptyState.classList.add('hidden');
            scrollContainer.classList.remove('hidden');
            chartWrapper.classList.add('hidden');
            output.classList.remove('hidden');

            output.innerHTML = `<div class="flex flex-col items-center justify-center py-20 text-yellow-600"><i data-lucide="shield-alert" class="w-10 h-10 mb-4 animate-pulse"></i><div class="flex items-center mb-2"><div class="typing-dot mr-1 bg-current"></div><div class="typing-dot mr-1 bg-current"></div><div class="typing-dot bg-current"></div></div><p class="text-sm font-bold uppercase tracking-widest text-slate-400 mt-2">Computing Wealth Destruction Gap...</p></div>`;
            lucide.createIcons();

            const sys = `You are an elite Quantum BA acting as a financial firewall. Your client is about to make a catastrophic emotional decision and overpay drastically for a property. You must snap them back to reality using pure, detached mathematics and logical dominance.
            
            Format STRICTLY with these Markdown headings:
            ### 🧮 The Negative Equity Math (The Shock)
            (Break down the exact mathematical damage: The overpayment gap, wasted stamp duty on the overpayment, and the massive LVR/Bank Valuation risk. Be brutal).
            
            ### 📉 Opportunity Cost Analysis
            (What else could they buy with this wasted capital? Explain how long it will take for market growth just to get them back to 'breakeven' on Day 1).
            
            ### 🗣️ The 'Walk-Away' Script (Verbal Intervention)
            (Write the exact, word-for-word script the BA must say on the phone right now. It must be authoritative, slightly harsh but highly protective. Strip away their emotional justification entirely).
            
            ### 🛑 Formal Boundary Setting (Email Disclaimer)
            (Provide the formal, written disclaimer email you must send them if they insist on proceeding against your advice, protecting your Fiduciary Standard).

            CRITICAL REQUIREMENT:
            At the VERY END, you MUST output a JSON block wrapped in ~~JSON_CHART~~ and ~~END_JSON~~ simulating the asset's trajectory over 5 years.
            Assume 4% annual growth on the Intrinsic Value. The Overpayment line starts at their offer price.
            Example:
            ~~JSON_CHART~~
            {"years": ["Purchase Day", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"], "intrinsic": [1000000, 1040000, 1081600, 1124800, 1169800, 1216600], "overpayment": [1250000, 1250000, 1250000, 1250000, 1250000, 1250000]}
            ~~END_JSON~~`;

            const prompt = `
            Property: ${address}
            Intrinsic Data Value: $${intrinsicVal}
            Client Wants to Offer: $${offerVal}
            Competing Offers: ${compOffers}
            Client Financial Risk: ${lvrRisk}
            Emotional Excuse: ${context}
            `;

            try {
                const res = await window.callGemini(prompt, sys);

                // Extract JSON Chart
                let chartYears = ["Purchase Day", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5"];
                let dataIntrinsic = [];
                let dataOffer = [];
                let cleanText = res;

                const jsonMatch = res.match(/~~JSON_CHART~~\s*(\{.*?\})\s*~~END_JSON~~/is);
                if (jsonMatch && jsonMatch[1]) {
                    try {
                        const parsed = JSON.parse(jsonMatch[1]);
                        if (parsed.years && parsed.intrinsic && parsed.overpayment) {
                            chartYears = parsed.years;
                            dataIntrinsic = parsed.intrinsic;
                            dataOffer = parsed.overpayment;
                        }
                        cleanText = res.replace(/~~JSON_CHART~~.*?~~END_JSON~~/is, '');
                    } catch (e) { console.warn("Failed parsing chart JSON"); }
                } else {
                    // Fallback math if AI fails JSON
                    let currentVal = intrinsicVal;
                    for (let i = 0; i <= 5; i++) {
                        dataIntrinsic.push(Math.round(currentVal));
                        dataOffer.push(offerVal);
                        currentVal = currentVal * 1.04;
                    }
                }

                let formattedHtml = cleanText
                    .replace(/###\s(.*?)\n/g, '<h3 class="text-[16px] font-bold text-yellow-900 mt-8 mb-4 pb-2 border-b border-yellow-200 uppercase tracking-wider flex items-center"><i data-lucide="shield-alert" class="w-5 h-5 mr-2 text-yellow-600"></i> $1</h3>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-900">$1</strong>')
                    .replace(/\n/g, '<br>');

                output.innerHTML = formattedHtml;

                // Render Chart
                chartWrapper.classList.remove('hidden');
                const ctx = document.getElementById('interventionChart').getContext('2d');
                if (interventionChartInstance) interventionChartInstance.destroy();

                interventionChartInstance = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: chartYears,
                        datasets: [
                            {
                                label: 'Intrinsic Value Trajectory (4% Growth)',
                                data: dataIntrinsic,
                                borderColor: '#10b981', // Emerald
                                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                fill: true,
                                tension: 0.3,
                                borderWidth: 3
                            },
                            {
                                label: 'Emotional Overpayment (Dead Capital Trap)',
                                data: dataOffer,
                                borderColor: '#ef4444', // Red
                                borderDash: [5, 5],
                                backgroundColor: 'transparent',
                                tension: 0,
                                borderWidth: 2
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { intersect: false, mode: 'index' },
                        scales: { y: { beginAtZero: false, ticks: { callback: function (value) { return '$' + value.toLocaleString(); } } } },
                        plugins: {
                            title: { display: true, text: '5-Year Wealth Destruction Simulation' },
                            tooltip: { callbacks: { label: function (context) { return context.dataset.label + ': $' + context.raw.toLocaleString(); } } }
                        }
                    }
                });

            } catch (error) {
                output.innerHTML = `<div class="text-red-500 font-bold p-4 bg-red-50 rounded-xl border border-red-200">Error generating intervention data.</div>`;
            }
            lucide.createIcons();
        }

        window.generateNegotiationStrategy = async function () {
            const ask = document.getElementById('neg-ask').value || 'Unknown';
            const target = document.getElementById('neg-target').value || 'Unknown';
            const dom = document.getElementById('neg-dom').value || 'Unknown';
            const motivation = document.getElementById('neg-motivation').value;
            const leverage = document.getElementById('neg-leverage').value || 'None specified';

            const output = document.getElementById('negotiation-output');
            const emptyState = document.getElementById('negotiation-empty-state');

            emptyState.classList.add('hidden');
            output.classList.remove('hidden');
            output.innerHTML = `<div class="flex flex-col items-center justify-center py-20 text-purple-600"><i data-lucide="crosshair" class="w-10 h-10 mb-4 animate-pulse"></i><div class="flex items-center mb-2"><div class="typing-dot mr-1 bg-current"></div><div class="typing-dot mr-1 bg-current"></div><div class="typing-dot bg-current"></div></div><p class="text-sm font-bold uppercase tracking-widest text-slate-400 mt-2">Computing Negotiation Matrix...</p></div>`;
            lucide.createIcons();

            const sys = `You are the Master Negotiator for Quantum BA. You orchestrate elite, high-stakes real estate deals using pure logic, psychological leverage, and 'Information Asymmetry'. 
            
            Analyze the provided parameters and draft a ruthless, structured attack plan.
            
            Format STRICTLY with these Markdown headings:
            ### ♟️ The Opening Move (Structure)
            (Detail the exact initial offer price and highly specific contractual terms/conditions designed to exploit the vendor's motivation. Explain WHY this structure works).
            
            ### 🗣️ The Agent Pitch Script
            (Write the exact, word-for-word verbal script the BA must use when presenting this offer to the selling agent. It must sound authoritative, emotionally detached, and frame the offer as a 'win out of mercy' due to the property's flaws or DOM).
            
            ### 🛡️ The Counter-Attack Matrix
            (If the vendor rejects the offer or the agent counters high, provide the exact 2-step tactical response to maintain control of the negotiation framework).`;

            const prompt = `
            Asking Price: ${ask}
            Target Price: ${target}
            Days On Market: ${dom}
            Vendor Motivation: ${motivation}
            Flaws / Leverage: ${leverage}
            `;

            try {
                const res = await window.callGemini(prompt, sys);

                let formattedHtml = res
                    .replace(/###\s(.*?)\n/g, '<h3 class="text-[15px] font-bold text-purple-900 mt-6 mb-4 pb-2 border-b border-purple-100 uppercase tracking-wider flex items-center"><i data-lucide="crosshair" class="w-4 h-4 mr-2 text-purple-500"></i> $1</h3>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-900">$1</strong>')
                    .replace(/\n/g, '<br>');

                output.innerHTML = formattedHtml;
            } catch (error) {
                console.error(error);
                output.innerHTML = `<div class="text-red-500 font-bold p-4 bg-red-50 rounded-xl border border-red-200">Error generating strategy. Please try again.</div>`;
            }
            lucide.createIcons();
        }

        window.askMentor = async function () {
            const input = document.getElementById('mentor-input');
            const log = document.getElementById('mentor-chat-log');
            if (!input.value.trim()) return;
            log.innerHTML += `<div class="bg-brand-900 text-white p-3 rounded-lg ml-8 text-right text-[12px]">${input.value}</div>`;
            const query = input.value; input.value = ''; log.scrollTop = log.scrollHeight;
            const prompt = "You are Quantum AI Mentor. Explain real estate/finance terms (like CDC, LMR, Bucket Companies) in max 3 sentences. Be highly professional and risk-averse.";
            const reply = await window.callGemini(query, prompt);
            log.innerHTML += `<div class="bg-slate-100 border border-slate-200 p-3 rounded-lg mr-8 text-[12px]">${reply}</div>`;
            log.scrollTop = log.scrollHeight;
        }

        window.generateOutreach = async function (type) {
            const input = document.getElementById('architect-input').value;
            const output = document.getElementById('architect-output');
            if (!input.trim()) return;
            output.innerHTML = `<div class="flex items-center text-orange-600"><div class="typing-dot mr-1"></div><div class="typing-dot mr-1"></div><div class="typing-dot"></div></div>`;
            output.classList.remove('hidden');
            const pType = type === 'script' ? "Pattern Interrupt SMS and cold call script" : "Social media post explaining why we rejected a property";
            const sys = "You are the Quantum Outreach Architect. Create bold, tailored outreach based on prospect pain points. Focus on data, risk mitigation, and protecting capital. Do not use generic sales jargon. Make it punchy and highly converting.";
            const res = await window.callGemini(`Generate a ${pType} based on this prospect situation: ${input}`, sys);
            output.innerHTML = res;
        }

        // --- LISTING AUDITOR (ULTIMATE EDITION) ---
        window.updateRiskLabel = function (val) {
            let text = "Moderate";
            if (val <= 3) text = "Conservative";
            else if (val >= 8) text = "Aggressive";
            document.getElementById('audit-risk-val').innerText = `${val} - ${text}`;
        }

        window.updateAuditorMap = function () {
            const address = document.getElementById('auditor-address').value;
            const iframe = document.getElementById('auditor-map');
            const placeholder = document.getElementById('map-placeholder');

            if (address) {
                iframe.src = `https://maps.google.com/maps?q=${encodeURIComponent(address)}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
                placeholder.classList.add('hidden');
            } else {
                iframe.src = '';
                placeholder.classList.remove('hidden');
            }
        }

        window.copyAuditReport = function () {
            const outputText = document.getElementById('auditor-output').innerText;
            navigator.clipboard.writeText(outputText).then(() => {
                const btn = document.getElementById('copy-audit-btn');
                const originalHtml = btn.innerHTML;
                btn.innerHTML = `<i data-lucide="check" class="w-4 h-4 mr-2"></i> Copied!`;
                btn.classList.replace('text-blue-600', 'text-emerald-600');
                btn.classList.replace('bg-blue-50', 'bg-emerald-50');
                btn.classList.replace('border-blue-200', 'border-emerald-200');
                lucide.createIcons();
                setTimeout(() => {
                    btn.innerHTML = originalHtml;
                    btn.classList.replace('text-emerald-600', 'text-blue-600');
                    btn.classList.replace('bg-emerald-50', 'bg-blue-50');
                    btn.classList.replace('border-emerald-200', 'border-blue-200');
                    lucide.createIcons();
                }, 2000);
            });
        }

        window.runAudit = async function () {
            const address = document.getElementById('auditor-address').value;
            const beds = document.getElementById('audit-beds').value;
            const baths = document.getElementById('audit-baths').value;
            const cars = document.getElementById('audit-cars').value;
            const land = document.getElementById('audit-land').value;
            const house = document.getElementById('audit-house').value;
            const price = document.getElementById('audit-price').value;
            const rent = document.getElementById('audit-rent').value;
            const buyerType = document.getElementById('audit-buyer').value;
            const riskTol = document.getElementById('audit-risk').value;
            const description = document.getElementById('auditor-input').value;

            const output = document.getElementById('auditor-output');
            const copyBtn = document.getElementById('copy-audit-btn');
            const emptyState = document.getElementById('auditor-empty-state');
            const chartWrapper = document.getElementById('auditor-chart-wrapper');

            if (!description.trim() && !address.trim()) {
                alert("Please provide at least an address or description.");
                return;
            }

            emptyState.classList.add('hidden');
            chartWrapper.classList.add('hidden');
            copyBtn.classList.add('hidden');

            output.innerHTML = `<div class="flex flex-col items-center justify-center py-20 text-blue-600"><i data-lucide="cpu" class="w-10 h-10 mb-4 animate-pulse"></i><div class="flex items-center mb-2"><div class="typing-dot mr-1"></div><div class="typing-dot mr-1"></div><div class="typing-dot"></div></div><p class="text-sm font-bold uppercase tracking-widest text-slate-400 mt-2">Connecting to Quantum Matrix & Simulating CoreLogic Data...</p></div>`;
            lucide.createIcons();

            const matrixContext = `THE QUANTUM PROPERTY ASSESSMENT MATRIX (80+ variables)
            1. LOCATION & MACRO: Suburb growth, median trends, DOM, infrastructure, employment, CBD distance, transport, school zones, flood/fire zones.
            2. LAND: Size, shape, frontage, slope, usable %, subdivision potential, zoning, easements.
            3. BUILDING: Build year, structural integrity, roof, plumbing, foundation.
            4. VALUE-ADD: Add bedroom (3 to 4), add bathroom, cosmetic reno, granny flat, build-under potential.
            5. FINANCIALS: Yield, holding costs, land tax.
            `;

            const sys = `You are the Elite Quantum Listing Auditor. You evaluate properties using the 80+ variable Quantum Property Assessment Matrix.
            
            ${matrixContext}
            
            Based on the inputs provided, generate a MASSIVE, highly comprehensive, client-facing 'Quantum Assessment Report'. You MUST simulate RP Data / CoreLogic insights using your vast knowledge of Australian real estate to provide educated estimations where exact data is missing.
            
            Format STRICTLY with these Markdown headings:
            ### 📊 Simulated CoreLogic / RP Data Valuation
            (Estimate exact value range, gross yield %, and 5-year suburb growth trajectory based on the address and specs provided).
            
            ### ⚖️ Buyer Suitability & Risk Profile
            (Explicitly evaluate if this is a good/bad buy for a [Buyer Type] with a Risk Tolerance of [Risk]/10. Give a definitive YES/NO/PROCEED WITH CAUTION verdict).
            
            ### 🚩 Critical Red Flags & Marketing Flaws
            (Deep dive into macro/micro location risks, structural liabilities, zoning issues. Decode the agent's marketing puffery).
            
            ### 🛠️ Value-Add Matrix & ROI Projections
            (Explicitly detail options like Granny Flats, 3-to-4 bed conversions, or cosmetic renos. Provide ESTIMATED COSTS vs ESTIMATED EQUITY UPLIFT. e.g., "Cosmetic Reno: Est Cost $40k -> Est Uplift $90k").
            
            ### 🗡️ Strategic Council & Negotiation Levers
            (Provide specific strategies to grind the price down based on typical local council zoning constraints, flood map concerns, or property flaws).
            
            ### ❓ Tactical Agent Interrogation
            (List 3-5 aggressive, highly specific technical questions the BA must ask the selling agent to strip their leverage).

            CRITICAL REQUIREMENT:
            At the VERY END of your entire text response, you MUST output a JSON block wrapped in exact delimiters ~~JSON_CHART~~ and ~~END_JSON~~. This will generate a visual matrix.
            Example:
            ~~JSON_CHART~~
            {"scores": [8, 6, 3, 7, 9]}
            ~~END_JSON~~
            The 5 numbers must be integers between 1 and 10 representing: [Capital Growth Potential, Rental Yield Potential, Value-Add Potential, Liquidity/Resale Ease, Overall Risk Level (1=Safe, 10=High Risk)].`;

            const prompt = `
            INPUTS:
            Address: ${address || 'Unknown'}
            Specs: ${beds} Bed, ${baths} Bath, ${cars} Car
            Size: Land ${land} sqm, House ${house} sqm
            Financials: Asking $${price}, Est Rent $${rent}/wk
            Client Profile: ${buyerType}, Risk Tolerance: ${riskTol}/10
            Description/Notes: ${description}
            `;

            try {
                const res = await window.callGemini(prompt, sys);

                // 1. Extract JSON Chart Data
                let chartScores = [5, 5, 5, 5, 5]; // Defaults
                let cleanText = res;

                const jsonMatch = res.match(/~~JSON_CHART~~\s*(\{.*?\})\s*~~END_JSON~~/is);
                if (jsonMatch && jsonMatch[1]) {
                    try {
                        const parsed = JSON.parse(jsonMatch[1]);
                        if (parsed.scores && parsed.scores.length === 5) {
                            chartScores = parsed.scores;
                        }
                        // Remove the JSON block from the text output
                        cleanText = res.replace(/~~JSON_CHART~~.*?~~END_JSON~~/is, '');
                    } catch (e) { console.warn("Could not parse AI JSON chart block."); }
                }

                // 2. Format markdown text
                let formattedHtml = cleanText
                    .replace(/###\s(.*?)\n/g, '<h3 class="text-[15px] font-bold text-brand-900 mt-8 mb-4 pb-2 border-b border-slate-200 uppercase tracking-wider flex items-center"><i data-lucide="crosshair" class="w-4 h-4 mr-2 text-brand-accent"></i> $1</h3>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-900">$1</strong>')
                    .replace(/\n/g, '<br>');

                output.innerHTML = formattedHtml;

                // 3. Render Chart.js Matrix
                chartWrapper.classList.remove('hidden');
                const ctx = document.getElementById('auditMatrixChart').getContext('2d');
                if (auditChartInstance) auditChartInstance.destroy();

                auditChartInstance = new Chart(ctx, {
                    type: 'radar',
                    data: {
                        labels: ['Capital Growth', 'Rental Yield', 'Value-Add ROI', 'Liquidity (Resale)', 'Risk Profile'],
                        datasets: [{
                            label: 'Quantum Suitability Score (out of 10)',
                            data: chartScores,
                            backgroundColor: 'rgba(59, 130, 246, 0.2)',
                            borderColor: '#3b82f6',
                            pointBackgroundColor: '#0f172a',
                            pointBorderColor: '#fff',
                            pointHoverBackgroundColor: '#fff',
                            pointHoverBorderColor: '#0f172a',
                            borderWidth: 2,
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            r: {
                                angleLines: { color: 'rgba(0, 0, 0, 0.1)' },
                                grid: { color: 'rgba(0, 0, 0, 0.1)' },
                                pointLabels: { font: { size: 11, family: 'Inter' }, color: '#475569' },
                                ticks: { display: false, min: 0, max: 10, stepSize: 2 }
                            }
                        },
                        plugins: { legend: { display: false } }
                    }
                });

                copyBtn.classList.remove('hidden');
                copyBtn.classList.add('flex');
            } catch (error) {
                console.error(error);
                output.innerHTML = `<div class="text-red-500 font-bold p-4 bg-red-50 rounded-xl border border-red-200">Error generating audit. Please verify your connection or inputs and try again.</div>`;
            }
            lucide.createIcons();
        }

        // --- OBJECTION LAB (SPARRING) LOGIC ---
        window.sparringCategories = [
            {
                title: "Stage 1: Prospecting & Qualification",
                topics: [
                    "Engagement Fee Pushback ($5k-$15k Upfront)",
                    "Success Fee Pushback (% of Purchase Price)",
                    "Stall Tactic: 'I need to talk to my partner/spouse'",
                    "Ghosting: Agreed to proceed, FSA sent, no reply",
                    "'Why can't I just use the Selling Agent?'"
                ]
            },
            {
                title: "Stage 2: Macro-Economic & Global Fears",
                topics: [
                    "Waiting for the RBA to drop interest rates before buying",
                    "Fear of a media-hyped property bubble burst",
                    "Geopolitical volatility (e.g., Strait of Hormuz conflict spiking energy/gas prices)",
                    "Global recession fears wiping out day-one equity",
                    "Comparing property returns to current high share market yields",
                    "Construction inflation making established home renovations too risky"
                ]
            },
            {
                title: "Stage 3: Micro-Economic & State-Specific Fears (AU)",
                topics: [
                    "VIC: 'The new land tax laws are destroying investor yields, I'm not buying.'",
                    "QLD: 'New rental cap and tenancy laws mean I have no control over my asset.'",
                    "NSW: 'Stamp duty is too much dead money upfront, I want to buy interstate.'",
                    "Federal: 'I'm terrified the government will abolish negative gearing soon.'",
                    "Cost of Living: 'My borrowing capacity is slashed, I should just keep renting.'",
                    "Insurance: 'Premiums in flood/cyclone zones have doubled, the holding costs are too high.'"
                ]
            },
            {
                title: "Stage 4: The Search & Asset Selection",
                topics: [
                    "'I can find properties myself on Domain/Realestate.com.au'",
                    "Expecting a 20% 'Bargain' under intrinsic market value",
                    "'Why not buy Off-The-Plan for tax benefits?'",
                    "Demanding a new build for maximum depreciation",
                    "Family/friends warned them against the target suburb",
                    "'Why do I need a Bucket Company/Trust structure?'"
                ]
            },
            {
                title: "Stage 5: Due Diligence, Negotiation & Execution",
                topics: [
                    "Wanting to build a Granny Flat for yield (Overcapitalization risk)",
                    "Overreacting to minor Building & Pest report issues",
                    "Panic over a Bank Valuation coming in short",
                    "Refusing to bid at auction / participate in competition"
                ]
            }
        ];

        window.labHistory = [];
        window.currentSparringTopic = "";
        window.currentSparringProfile = null;

        window.renderSparringMenu = function () {
            const menuView = document.getElementById('lab-menu-view');
            const chatView = document.getElementById('lab-chat-view');
            const resumeBox = document.getElementById('resume-session-container');
            const grid = document.getElementById('sparring-topics-grid');
            const finishBtn = document.getElementById('finish-session-btn');

            menuView.classList.remove('hidden');
            chatView.classList.add('hidden');
            finishBtn.classList.add('hidden');

            if (window.userData.savedSparringSession && window.userData.savedSparringSession.history.length > 0) {
                resumeBox.classList.remove('hidden');
            } else {
                resumeBox.classList.add('hidden');
            }

            // FIXED: Upgraded styling for better readability and spacing
            let gridHtml = `
            <div class="mb-10 p-7 bg-white border border-slate-200 rounded-xl shadow-sm">
                <h3 class="font-bold text-brand-900 mb-6 flex items-center border-b border-slate-100 pb-4"><i data-lucide="user-cog" class="w-5 h-5 mr-2 text-brand-accent"></i> Step 1: Configure Client Profile</h3>
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                        <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Gender</label>
                        <select id="sparring-gender" class="w-full p-3 border border-slate-200 rounded-lg text-sm outline-none bg-slate-50 focus:border-brand-accent focus:bg-white transition-colors">
                            <option value="Male">Male</option>
                            <option value="Female">Female</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Age</label>
                        <input type="number" id="sparring-age" class="w-full p-3 border border-slate-200 rounded-lg text-sm outline-none bg-slate-50 focus:border-brand-accent focus:bg-white transition-colors" placeholder="e.g. 45" value="45">
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Living Location</label>
                        <input type="text" id="sparring-current-loc" class="w-full p-3 border border-slate-200 rounded-lg text-sm outline-none bg-slate-50 focus:border-brand-accent focus:bg-white transition-colors" placeholder="e.g. Sydney, NSW" value="Sydney, NSW">
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Target Location</label>
                        <input type="text" id="sparring-target-loc" class="w-full p-3 border border-slate-200 rounded-lg text-sm outline-none bg-slate-50 focus:border-brand-accent focus:bg-white transition-colors" placeholder="e.g. Brisbane, QLD" value="Brisbane, QLD">
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Target Asset Type</label>
                        <select id="sparring-prop-type" class="w-full p-3 border border-slate-200 rounded-lg text-sm outline-none bg-slate-50 focus:border-brand-accent focus:bg-white transition-colors">
                            <option value="House">House</option>
                            <option value="Townhouse">Townhouse</option>
                            <option value="Apartment">Apartment</option>
                            <option value="Villa">Villa</option>
                            <option value="Duplex">Duplex</option>
                            <option value="Acreage/Rural">Acreage / Rural</option>
                            <option value="Dual Key">Dual Key</option>
                            <option value="Block of Units">Block of Units</option>
                            <option value="Commercial">Commercial</option>
                            <option value="Vacant Land">Vacant Land</option>
                            <option value="Off-The-Plan">Off-The-Plan</option>
                            <option value="Penthouse">Penthouse</option>
                            <option value="Terraced House">Terraced House</option>
                            <option value="Studio">Studio</option>
                            <option value="Heritage Home">Heritage Home</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Investor Type</label>
                        <select id="sparring-buyer-type" class="w-full p-3 border border-slate-200 rounded-lg text-sm outline-none bg-slate-50 focus:border-brand-accent focus:bg-white transition-colors">
                            <option value="Investor">Investor</option>
                            <option value="Owner Occupier">Owner Occupier</option>
                            <option value="First Home Buyer">First Home Buyer</option>
                            <option value="Developer">Developer</option>
                        </select>
                    </div>
                </div>
            </div>
            
            <div class="mb-2">
                <h3 class="font-bold text-brand-900 flex items-center text-lg"><i data-lucide="map" class="w-5 h-5 mr-2 text-brand-accent"></i> Step 2: Select Sparring Scenario (Buyer Journey)</h3>
            </div>
            `;

            window.sparringCategories.forEach((category) => {
                gridHtml += `<div class="mt-6 mb-6">`;
                gridHtml += `<h4 class="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-200 pb-2">${category.title}</h4>`;
                gridHtml += `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">`;
                category.topics.forEach((topic) => {
                    gridHtml += `
                        <button onclick="startSparring('${topic.replace(/'/g, "\\'")}')" class="text-left p-5 bg-white border border-slate-200 rounded-xl hover:border-brand-accent hover:shadow-lg hover:-translate-y-1 transition-all group flex flex-col h-full">
                            <span class="text-[10px] font-bold text-slate-400 block mb-2 group-hover:text-brand-accent transition-colors uppercase tracking-wider">Scenario</span>
                            <span class="text-sm font-semibold text-slate-800 block flex-1 leading-relaxed">${topic}</span>
                        </button>
                    `;
                });
                gridHtml += `</div></div>`;
            });
            grid.innerHTML = gridHtml;
        }

        window.sparringAudioPlayer = null;
        window.playSparringAudio = async function (text) {
            if (window.sparringAudioPlayer) {
                window.sparringAudioPlayer.pause();
                window.sparringAudioPlayer = null;
            }

            // Strip out markdown bolding and asterisks for cleaner speech
            const cleanText = text.replace(/[*#]/g, '').trim();
            if (!cleanText) return;

            // Dynamically assign voice based on client profile
            let voiceSelection = "Puck"; // Default Male
            if (window.currentSparringProfile && window.currentSparringProfile.gender === "Female") {
                voiceSelection = "Kore"; // Default Female
            }

            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`;
            const payload = {
                contents: [{ parts: [{ text: "Please convert the following text to speech exactly: " + cleanText }] }],
                generationConfig: {
                    responseModalities: ["AUDIO"],
                    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceSelection } } }
                }
            };

            try {
                const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                const result = await response.json();

                if (result.candidates && result.candidates[0].content.parts[0].inlineData) {
                    const inlineData = result.candidates[0].content.parts[0].inlineData;
                    const sampleRateMatch = inlineData.mimeType.match(/rate=(\d+)/);
                    const sampleRate = sampleRateMatch ? parseInt(sampleRateMatch[1]) : 24000;

                    const binaryString = window.atob(inlineData.data);
                    const pcmBuffer = new ArrayBuffer(binaryString.length);
                    const view = new Uint8Array(pcmBuffer);
                    for (let i = 0; i < binaryString.length; i++) {
                        view[i] = binaryString.charCodeAt(i);
                    }

                    const numChannels = 1;
                    const bitsPerSample = 16;
                    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
                    const blockAlign = numChannels * (bitsPerSample / 8);
                    const dataSize = pcmBuffer.byteLength;
                    const wavBuffer = new ArrayBuffer(44 + dataSize);
                    const wavView = new DataView(wavBuffer);
                    const writeStr = (offset, string) => { for (let i = 0; i < string.length; i++) wavView.setUint8(offset + i, string.charCodeAt(i)); };

                    writeStr(0, 'RIFF');
                    wavView.setUint32(4, 36 + dataSize, true);
                    writeStr(8, 'WAVE');
                    writeStr(12, 'fmt ');
                    wavView.setUint32(16, 16, true);
                    wavView.setUint16(20, 1, true);
                    wavView.setUint16(22, numChannels, true);
                    wavView.setUint32(24, sampleRate, true);
                    wavView.setUint32(28, byteRate, true);
                    wavView.setUint16(32, blockAlign, true);
                    wavView.setUint16(34, bitsPerSample, true);
                    writeStr(36, 'data');
                    wavView.setUint32(40, dataSize, true);

                    const pcmDataView = new Uint8Array(pcmBuffer);
                    const outDataView = new Uint8Array(wavBuffer, 44);
                    outDataView.set(pcmDataView);

                    const blob = new Blob([wavBuffer], { type: 'audio/wav' });
                    const audioUrl = URL.createObjectURL(blob);

                    window.sparringAudioPlayer = new Audio(audioUrl);
                    window.sparringAudioPlayer.play();
                }
            } catch (e) { console.error("Sparring TTS Error:", e); }
        }

        window.startSparring = async function (topic) {
            window.currentSparringTopic = topic;
            window.labHistory = [];

            // Capture Profile Data
            const gender = document.getElementById('sparring-gender')?.value || "Male";
            const age = document.getElementById('sparring-age')?.value || "40";
            const currentLoc = document.getElementById('sparring-current-loc')?.value || "Unknown Location";
            const targetLoc = document.getElementById('sparring-target-loc')?.value || "Target Suburb";
            const propType = document.getElementById('sparring-prop-type')?.value || "House";
            const buyerType = document.getElementById('sparring-buyer-type')?.value || "Investor";

            window.currentSparringProfile = { gender, age, currentLoc, targetLoc, propType, buyerType };

            document.getElementById('lab-menu-view').classList.add('hidden');
            document.getElementById('lab-chat-view').classList.remove('hidden');
            document.getElementById('lab-chat-view').classList.add('flex');
            document.getElementById('finish-session-btn').classList.remove('hidden');

            const log = document.getElementById('lab-chat-log');
            log.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-slate-400"><div class="typing-dot bg-brand-accent mb-3"></div><p class="text-sm">Client is entering the room...</p></div>`;

            // Have Gemini generate the opening objection based on the topic & profile
            const sys = `You are a difficult, high-net-worth real estate client meeting with a Quantum Buyer's Agent. 
            CLIENT PROFILE:
            - Gender: ${gender}
            - Age: ${age}
            - Current Location: ${currentLoc}
            - Desired Purchase Location: ${targetLoc}
            - Target Property: ${propType}
            - Investor Type: ${buyerType}
            
            Provide ONE aggressive, realistic opening sentence or objection based strictly on the scenario provided: "${topic}". Factor in their specific demographic, financial position, and location profile to make the objection hyper-realistic. Do not use formatting or backticks. Speak directly as the client.`;

            const initialObjection = await window.callGemini(`Scenario: ${topic}`, sys);

            window.labHistory.push(`Client: ${initialObjection}`);

            log.innerHTML = `
                <div class="flex flex-col items-start w-full">
                    <div class="bg-white border border-slate-200 p-5 rounded-2xl rounded-tl-none shadow-sm text-[14px] text-slate-800 max-w-[85%] leading-relaxed">
                        <span class="text-[11px] font-bold text-brand-accent mb-2 block uppercase tracking-widest flex items-center"><i data-lucide="user-x" class="w-3 h-3 mr-1"></i> Simulated Client (${gender}, ${age}yo ${buyerType})</span>
                        "${initialObjection}"
                    </div>
                </div>
            `;
            lucide.createIcons();

            // Speak the initial opening objection out loud
            window.playSparringAudio(initialObjection);
        }

        window.resumeSparring = function () {
            const session = window.userData.savedSparringSession;
            if (!session) return;

            window.currentSparringTopic = session.topic;
            window.labHistory = [...session.history];
            window.currentSparringProfile = session.profile || null;

            document.getElementById('lab-menu-view').classList.add('hidden');
            document.getElementById('lab-chat-view').classList.remove('hidden');
            document.getElementById('lab-chat-view').classList.add('flex');
            document.getElementById('finish-session-btn').classList.remove('hidden');

            const log = document.getElementById('lab-chat-log');
            log.innerHTML = '';

            window.labHistory.forEach(msg => {
                if (msg.startsWith('Agent: ')) {
                    const text = msg.substring(7);
                    log.innerHTML += `
                        <div class="flex flex-col items-end w-full mt-4">
                            <div class="bg-brand-accent text-white p-5 rounded-2xl rounded-tr-none shadow-sm text-[14px] max-w-[85%] leading-relaxed">
                                <span class="text-[11px] font-bold text-blue-200 mb-2 block uppercase tracking-widest flex items-center"><i data-lucide="shield-check" class="w-3 h-3 mr-1"></i> You (Agent)</span>
                                ${text}
                            </div>
                        </div>`;
                } else if (msg.startsWith('Client: ')) {
                    const text = msg.substring(8);

                    // Parse potential coaching block from history
                    let score = "0/100";
                    let critique = "";
                    let standard = "";
                    let why = "";
                    let clientText = text;

                    const scoreMatch = text.match(/\*\*Score:\*\*\s*(.*?)\n/);
                    const critiqueMatch = text.match(/\*\*Critique:\*\*\s*(.*?)\n/);
                    const standardMatch = text.match(/\*\*The Quantum Standard:\*\*\s*(.*?)\n/);
                    const whyMatch = text.match(/\*\*The Why:\*\*\s*(.*?)\n/);
                    const clientMatch = text.match(/\*\*Client:\*\*\s*([\s\S]*)/);

                    let coachHtml = '';
                    if (scoreMatch && critiqueMatch && clientMatch) {
                        score = scoreMatch[1].trim();
                        critique = critiqueMatch[1].trim();
                        standard = standardMatch ? standardMatch[1].trim() : '';
                        why = whyMatch ? whyMatch[1].trim() : '';
                        clientText = clientMatch[1].trim();

                        coachHtml = `
                        <div class="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl w-full mb-3 shadow-sm text-[13px] text-slate-700 relative overflow-hidden">
                            <div class="absolute top-0 left-0 w-1 h-full bg-emerald-400"></div>
                            <div class="flex justify-between items-center mb-2 pl-2">
                                <span class="font-bold text-emerald-800 flex items-center"><i data-lucide="shield-check" class="w-4 h-4 mr-1"></i> AI Coach Assessment</span>
                                <span class="bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded font-bold text-xs">Score: ${score}</span>
                            </div>
                            <p class="mb-3 pl-2"><strong>Critique:</strong> ${critique}</p>
                            <div class="bg-white p-4 rounded-lg border border-emerald-100 mb-2 relative">
                                <span class="absolute -top-2.5 left-3 bg-emerald-100 text-emerald-700 px-2 text-[9px] font-bold uppercase tracking-widest rounded shadow-sm">The A.A.R.M. Standard (What to say)</span>
                                <p class="text-emerald-900 italic mt-1 font-serif text-[14px]">"${standard}"</p>
                            </div>
                            <p class="text-[11px] text-emerald-600 pl-2 mt-2"><strong class="uppercase tracking-widest text-emerald-800">Framework Focus:</strong> ${why}</p>
                        </div>
                        `;
                    }

                    log.innerHTML += `
                        <div class="flex flex-col items-start w-full mt-4">
                            ${coachHtml}
                            <div class="bg-white border border-slate-200 p-5 rounded-2xl rounded-tl-none shadow-sm text-[14px] text-slate-800 max-w-[85%] leading-relaxed">
                                <span class="text-[11px] font-bold text-brand-accent mb-2 block uppercase tracking-widest flex items-center"><i data-lucide="user-x" class="w-3 h-3 mr-1"></i> Simulated Client</span>
                                ${clientText.replace(/\n/g, '<br>')}
                            </div>
                        </div>`;
                }
            });
            lucide.createIcons();
            log.scrollTop = log.scrollHeight;
        }

        window.finishSparringSession = async function () {
            if (window.labHistory.length > 0) {
                window.userData.savedSparringSession = {
                    topic: window.currentSparringTopic,
                    history: window.labHistory,
                    profile: window.currentSparringProfile
                };
                await saveUserData();
            }
            window.closeAllModals(); // Closes modal safely
        }

        window.clearSparringSession = async function () {
            window.userData.savedSparringSession = null;
            window.labHistory = [];
            window.currentSparringProfile = null;
            if (window.sparringAudioPlayer) {
                window.sparringAudioPlayer.pause();
                window.sparringAudioPlayer = null;
            }
            await saveUserData();
            renderSparringMenu();
        }

        window.sendLabMessage = async function () {
            const input = document.getElementById('lab-input');
            const log = document.getElementById('lab-chat-log');
            const text = input.value.trim();
            if (!text) return;

            // Stop voice recognition if it's running and they click send
            if (window.recognition && window.isRecording) {
                window.recognition.stop();
            }

            log.innerHTML += `
                <div class="flex flex-col items-end w-full mt-4 animate-fade-in">
                    <div class="bg-brand-accent text-white p-5 rounded-2xl rounded-tr-none shadow-sm text-[14px] max-w-[85%] leading-relaxed">
                        <span class="text-[11px] font-bold text-blue-200 mb-2 block uppercase tracking-widest flex items-center"><i data-lucide="shield-check" class="w-3 h-3 mr-1"></i> You (Agent)</span>
                        ${text}
                    </div>
                </div>`;
            input.value = '';
            window.labHistory.push(`Agent: ${text}`);

            log.innerHTML += `<div id="typing-ind" class="flex flex-col items-start mt-4"><div class="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm"><div class="flex items-center text-brand-accent"><div class="typing-dot mr-1"></div><div class="typing-dot mr-1"></div><div class="typing-dot"></div></div></div></div>`;
            log.scrollTop = log.scrollHeight;
            lucide.createIcons();

            const profile = window.currentSparringProfile || {};
            const sys = `You are an elite Quantum BA coach evaluating an agent's objection handling AND acting as the difficult client. 
            
            THE SCENARIO: ${window.currentSparringTopic}
            CLIENT PROFILE: ${profile.age}yo ${profile.gender} ${profile.buyerType}. Living in ${profile.currentLoc}, buying a ${profile.propType} in ${profile.targetLoc}.
            
            The agent must use the A.A.R.M framework (Acknowledge, Anchor to Data, Reframe Risk, Move to Action).
            
            1) First, evaluate their response aggressively.
            2) Then, act as the difficult client and give your next counter-objection or yield.
            
            Format EXACTLY like this (include all markdown bolding exactly):
            **Score:** [X/100]
            **Critique:** [1-2 sentences analyzing what they did right/wrong]
            **The Quantum Standard:** [Write the exact, word-for-word response they SHOULD have used based on the A.A.R.M framework]
            **The Why:** [Briefly explain the psychological/framework reason this standard works]
            **Client:** [The client's verbal response or next objection]`;

            const reply = await window.callGemini(window.labHistory.join('\n'), sys);

            document.getElementById('typing-ind').remove();

            window.labHistory.push(`Client: ${reply}`); // Save full raw reply to history for resuming later

            // Extract fields for rich rendering
            let score = "0/100";
            let critique = "";
            let standard = "";
            let why = "";
            let clientText = reply;

            const scoreMatch = reply.match(/\*\*Score:\*\*\s*(.*?)\n/);
            const critiqueMatch = reply.match(/\*\*Critique:\*\*\s*(.*?)\n/);
            const standardMatch = reply.match(/\*\*The Quantum Standard:\*\*\s*(.*?)\n/);
            const whyMatch = reply.match(/\*\*The Why:\*\*\s*(.*?)\n/);
            const clientMatch = reply.match(/\*\*Client:\*\*\s*([\s\S]*)/);

            let coachHtml = '';
            if (scoreMatch && critiqueMatch && clientMatch) {
                score = scoreMatch[1].trim();
                critique = critiqueMatch[1].trim();
                standard = standardMatch ? standardMatch[1].trim() : '';
                why = whyMatch ? whyMatch[1].trim() : '';
                clientText = clientMatch[1].trim();

                coachHtml = `
                <div class="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl w-full mb-3 shadow-sm text-[13px] text-slate-700 relative overflow-hidden">
                    <div class="absolute top-0 left-0 w-1 h-full bg-emerald-400"></div>
                    <div class="flex justify-between items-center mb-2 pl-2">
                        <span class="font-bold text-emerald-800 flex items-center"><i data-lucide="shield-check" class="w-4 h-4 mr-1"></i> AI Coach Assessment</span>
                        <span class="bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded font-bold text-xs">Score: ${score}</span>
                    </div>
                    <p class="mb-3 pl-2"><strong>Critique:</strong> ${critique}</p>
                    <div class="bg-white p-4 rounded-lg border border-emerald-100 mb-2 relative">
                        <span class="absolute -top-2.5 left-3 bg-emerald-100 text-emerald-700 px-2 text-[9px] font-bold uppercase tracking-widest rounded shadow-sm">The A.A.R.M. Standard (What to say)</span>
                        <p class="text-emerald-900 italic mt-1 font-serif text-[14px]">"${standard}"</p>
                    </div>
                    <p class="text-[11px] text-emerald-600 pl-2 mt-2"><strong class="uppercase tracking-widest text-emerald-800">Framework Focus:</strong> ${why}</p>
                </div>
                `;
            }

            log.innerHTML += `
                <div class="flex flex-col items-start w-full mt-4 animate-fade-in">
                    ${coachHtml}
                    <div class="bg-white border border-slate-200 p-5 rounded-2xl rounded-tl-none shadow-sm text-[14px] text-slate-800 max-w-[85%] leading-relaxed mt-1">
                        <span class="text-[11px] font-bold text-brand-accent mb-2 block uppercase tracking-widest flex items-center"><i data-lucide="user-x" class="w-3 h-3 mr-1"></i> Simulated Client</span>
                        ${clientText.replace(/\n/g, '<br>')}
                    </div>
                </div>`;
            log.scrollTop = log.scrollHeight;

            // Play audio ONLY for the client's new verbal response (ignore coaching text)
            window.playSparringAudio(clientText);
        }

        // --- VOICE TO TEXT (Web Speech API) ---
        window.recognition = null;
        window.isRecording = false;

        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            window.recognition = new SpeechRecognition();
            window.recognition.continuous = true;
            window.recognition.interimResults = true;

            window.recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                const input = document.getElementById('lab-input');
                if (finalTranscript) {
                    input.value += (input.value && !input.value.endsWith(' ') ? ' ' : '') + finalTranscript + ' ';
                }
            };

            window.recognition.onend = () => {
                window.isRecording = false;
                updateMicUI();
            };

            window.recognition.onerror = (event) => {
                console.error("Speech recognition error", event.error);
                window.isRecording = false;
                updateMicUI();
            };
        }

        window.toggleSpeechRecognition = function () {
            if (!window.recognition) {
                alert("Voice recognition is not supported in this browser. Please use Chrome or Edge.");
                return;
            }

            if (window.isRecording) {
                window.recognition.stop();
            } else {
                window.recognition.start();
                window.isRecording = true;
            }
            updateMicUI();
        }

        function updateMicUI() {
            const btn = document.getElementById('mic-btn');
            const status = document.getElementById('mic-status');

            if (window.isRecording) {
                btn.classList.remove('bg-slate-100', 'text-slate-500');
                btn.classList.add('bg-red-50', 'text-red-500', 'border-red-200');
                status.classList.remove('hidden');
            } else {
                btn.classList.add('bg-slate-100', 'text-slate-500');
                btn.classList.remove('bg-red-50', 'text-red-500', 'border-red-200');
                status.classList.add('hidden');
            }
        }

        // --- PHASE EXAMS (Dynamic) ---
        window.generatePhaseExam = async function (phaseId) {
            const container = document.getElementById('phase-exam-container');
            container.classList.remove('hidden');
            container.innerHTML = `<div class="text-center py-4 text-brand-900 font-bold"><div class="typing-dot inline-block mr-1"></div>Generating AI Exam...</div>`;

            // Updated Prompt to enforce 4 options and distractor traps
            const sys = `Create a 1-question difficult multiple choice exam to test passage of Phase ${phaseId}. Return ONLY JSON format: {"q":"Question?","options":["A","B","C","D"],"ans":0,"exp":"Why"}. Ensure there are exactly 4 options, and at least two options are very similar to test deep comprehension.`;
            try {
                const res = await window.callGemini(`Generate phase ${phaseId} exam for Quantum Buyers Agents covering risk, compliance, or wealth.`, sys);
                const data = JSON.parse(res.replace(/```json/gi, '').replace(/```/g, '').trim());
                window.currentPhaseQuiz = data;

                // Shuffle Phase Options
                const shuffledPhaseOptions = data.options.map((o, idx) => ({ text: o, idx: idx }));
                for (let i = shuffledPhaseOptions.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [shuffledPhaseOptions[i], shuffledPhaseOptions[j]] = [shuffledPhaseOptions[j], shuffledPhaseOptions[i]];
                }

                container.innerHTML = `
                    <p class="font-bold text-slate-800 mb-4">${data.q}</p>
                    <div class="space-y-2">
                        ${shuffledPhaseOptions.map(optObj => `<button onclick="submitPhaseExam(${optObj.idx}, ${phaseId})" class="w-full text-left p-3 text-sm border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">${optObj.text}</button>`).join('')}
                    </div>
                `;
            } catch (e) { container.innerHTML = "<p class='text-red-500'>AI error. Try again.</p>"; }
        }

        window.submitPhaseExam = async function (selectedIdx, phaseId) {
            const container = document.getElementById('phase-exam-container');
            if (selectedIdx === window.currentPhaseQuiz.ans) {
                container.innerHTML = `<div class="text-emerald-600 font-bold text-center"><i data-lucide="unlock" class="w-8 h-8 mx-auto mb-2"></i> Phase ${phaseId + 1} Unlocked! (+50 💎)</div>`;
                window.userData.unlockedPhases.push(phaseId + 1);
                window.userData.points += 50;
                await saveUserData();
                setTimeout(() => renderSidebar(), 1500);
            } else {
                container.innerHTML = `<div class="text-red-600 font-bold text-center"><i data-lucide="x-circle" class="w-8 h-8 mx-auto mb-2"></i> Failed. Review material and try again.</div>`;
                setTimeout(() => window.generatePhaseExam(phaseId), 2000);
            }
            lucide.createIcons();
        }

        // --- MASTER CERTIFICATION EXAM (60 Questions) ---
        // All questions updated to 4 options with specific distractors
        window.masterExamQuestions = [
            // Phase 1: DNA & Identity
            { q: "What is the primary function of a Quantum BA?", options: ["To find properties fast", "To act as a financial firewall and mitigate risk", "To act as a real estate matchmaker and minimize friction", "To negotiate the lowest fee"], ans: 1 },
            { q: "Why do we absolutely reject 'Off-The-Plan' purchases?", options: ["They carry systemic valuation risk and unknown future supply", "The commissions aren't high enough", "They are often built in the wrong suburbs", "The builds take too long"], ans: 0 },
            { q: "How is success measured in the Quantum Flywheel?", options: ["Volume of deals closed per quarter", "Client's long-term net worth and compounding equity", "The total equity manufactured in year one", "Number of 5-star Google reviews"], ans: 1 },
            { q: "What defines our 'Fiduciary Standard'?", options: ["We never accept kickbacks from developers or sales agents", "We always buy below the listing price", "We always act as a completely independent party without bias", "We guarantee capital growth"], ans: 0 },
            { q: "What is 'Information Asymmetry' in our context?", options: ["Knowing more than the buyer and the selling agent to protect value", "Hiding property defects from the client", "Holding data the vendor doesn't have to control the deal", "Using secret real estate portals"], ans: 0 },
            { q: "What is a 'Good Decision' according to Quantum philosophy?", options: ["A decision made purely on mathematical data and risk mitigation", "A decision that feels right to the client", "A decision driven by minimizing upfront costs", "A decision made faster than competing buyers"], ans: 0 },

            // Phase 2: Compliance
            { q: "In QLD, what makes a ground floor legally habitable?", options: ["A window", "2.4m minimum ceiling height to the joist", "2.3m minimum ceiling height with ventilation", "Carpeted floors"], ans: 1 },
            { q: "Under the NCC, what is the minimum ceiling height for a legal bedroom?", options: ["2.1m", "2.3m", "2.4m", "2.5m"], ans: 2 },
            { q: "What is the risk of purchasing an 'unapproved structure'?", options: ["The council may issue a demolition order, destroying capital", "It just means slightly higher insurance", "The council will issue a retrospective approval fee", "There is no real risk if the buyer is aware"], ans: 0 },
            { q: "Why are Trust Account protocols strictly enforced?", options: ["To ensure agents get paid immediately", "To maintain absolute compliance and protect client deposits", "To ensure smooth communication with lawyers", "Because the bank requires it for mortgages"], ans: 1 },
            { q: "How do we handle Dual Agency scenarios?", options: ["We don't. We only ever represent the buyer.", "We accept a fee from both if disclosed.", "We require a signed waiver from the seller.", "We pass the client to the selling agent."], ans: 0 },

            // Phase 3 & 4: Operations & Prospecting
            { q: "What is the purpose of the 'Pattern Interrupt' cold call?", options: ["To sell our services immediately", "To break the agent's autopilot and establish authority quickly", "To build rapport through friendly conversation", "To ask for off-market listings nicely"], ans: 1 },
            { q: "What is 'Authority Bait'?", options: ["Offering a discount on our fee", "A high-value piece of tactical content that proves our expertise", "A post showing how much money we saved a client", "A promise to find an off-market deal in 7 days"], ans: 1 },
            { q: "How fast must a new lead be qualified?", options: ["Within 2 minutes", "Within 24 hours", "Within 1 hour of receiving their details", "After they sign a retainer"], ans: 0 },
            { q: "What is the core of the Zero-Inbox philosophy?", options: ["Deleting all emails daily", "Treating the inbox as a triage center, actioning or delegating immediately", "Ignoring emails that aren't from clients", "Never sending emails, only SMS"], ans: 1 },
            { q: "Why do we track selling agent motivations in GHL?", options: ["To send them birthday gifts", "To identify distressed campaigns and leverage negotiation asymmetry", "To figure out which agency they work for", "To report them to the regulatory board"], ans: 1 },

            // Phase 5 & 8: Conversion & Discovery
            { q: "How should a BA act during a Discovery Call?", options: ["Like a salesperson pitching features", "Like a Doctor diagnosing a problem", "Like a consultant suggesting different options", "Like a friend building rapport first"], ans: 1 },
            { q: "What is 'Radical Honesty'?", options: ["Telling the client they are wrong about everything", "Telling a client immediately if their brief is impossible, establishing deep trust", "Telling the client their budget is too low for the market", "Sharing our internal profit margins"], ans: 1 },
            { q: "What is the 'Silence Gap' tactic?", options: ["Hanging up if they object", "Stating a boundary or price, and remaining completely silent to assert authority", "Listening carefully to their objections without interrupting", "Muting the microphone during a zoom call"], ans: 1 },
            { q: "Why do we use the 'Mirroring' technique?", options: ["To mock the client", "To subconsciously build empathy and encourage the client to reveal more information", "To establish dominance in the conversation", "To stall for time"], ans: 1 },
            { q: "What is 'Sales Breath'?", options: ["A bad connection on a call", "The palpable desperation of an agent trying to close a deal, which repels high-net-worth clients", "Sounding too aggressive during a pitch", "Talking too fast"], ans: 1 },

            // Phase 9 & 10: Objections
            { q: "How do we handle a client requesting a fee discount?", options: ["Agree to win the business", "Walk away immediately", "Reframe the conversation to ROI and the massive capital risk of making a mistake", "Offer a smaller discount to compromise"], ans: 2 },
            { q: "Client says: 'I can do it myself using Domain'. You respond:", options: ["You're right, it's easy.", "You're only seeing the 20% of properties that didn't sell off-market. You are buying the market's rejects.", "Domain is mostly outdated listings.", "I have better search filters than you."], ans: 1 },
            { q: "Client says: 'We want to wait for interest rates to drop.' The Quantum response is:", options: ["That's a smart, safe idea.", "When rates drop, borrowing capacity surges, causing prices to spike instantly. You will pay more for the asset than you saved in interest.", "Rates won't drop enough to matter.", "Rates are never going to drop."], ans: 1 },
            { q: "What is the 'Rental Yield Loss Math'?", options: ["Showing clients that delaying a $1M purchase costs them $1,000+ per week in lost rent and capital growth", "Calculating the property manager's fee", "Explaining how vacancy rates affect their returns", "Explaining negative gearing"], ans: 0 },
            { q: "If a client wants a 'Bargain', we explain:", options: ["We will offer 20% under asking on everything.", "A 'bargain' often hides systemic flaws. We don't buy cheap assets; we buy superior assets at intrinsic value.", "We can find bargains but it takes longer.", "Bargains don't exist in Australia."], ans: 1 },

            // Phase 11: Wealth Engineering
            { q: "What is the primary benefit of a Bucket Company structure?", options: ["Avoiding stamp duty", "Capping tax on distributed rental profits at the corporate rate to preserve capital", "Allowing unlimited tax-free withdrawals", "Hiding assets from banks"], ans: 1 },
            { q: "What is the consequence of taking cash out of a Bucket Company for personal use?", options: ["Nothing, it's your money", "It triggers severe Division 7A tax traps", "It triggers a capital gains event", "It lowers the CGT discount"], ans: 1 },
            { q: "Why do we advise holding growth assets in a Family Trust rather than a Company?", options: ["Trusts are cheaper to run", "Companies do not get the 50% Capital Gains Tax discount", "Companies pay higher stamp duty", "Banks prefer lending to Trusts"], ans: 1 },
            { q: "What is the defining characteristic of LMR zoning?", options: ["Low-Medium Density Residential, allowing for townhouses or unit blocks", "Large Mansion Residential", "Light Minimum Residential", "Light Manufacturing Requirements"], ans: 0 },
            { q: "Why is an 'Established Asset' mathematically superior to a new build?", options: ["Because old houses have more character", "Because the land-to-asset ratio is dramatically higher, and land appreciates while buildings depreciate", "Because new builds have too many hidden fees", "Because new builds are too small"], ans: 1 },

            // Further Advanced Topics
            { q: "What is the '76% Edge'?", options: ["Our success rate at auctions", "The percentage of our deals secured totally off-market through our B2B network", "The percentage of our deals secured pre-auction", "The average LVR of our clients"], ans: 1 },
            { q: "How do we rescue a 'Failed Settlement'?", options: ["We pay the difference for the client", "We utilize our network of aggressive tier-2 brokers to secure rapid alternative finance", "We threaten the vendor with legal action", "We tell the client to walk away and lose their deposit"], ans: 1 },
            { q: "What is 'Zoning Warfare'?", options: ["Fighting with the local council", "Identifying properties where the current use is 'under-utilizing' the legally allowed zoning", "Applying for DA approvals on every property", "Protesting high-density developments"], ans: 1 },
            { q: "Why weaponize a Building & Pest report?", options: ["To sue the inspector", "To legitimately extract $10k-$30k in price reductions by quantifying repair risks to the selling agent", "To justify walking away from a bad deal", "To terrify the buyer so they back out"], ans: 1 },
            { q: "In Auction Dominance, where should the Quantum BA physically stand?", options: ["At the very back, hiding", "Directly in the line of sight of the auctioneer and the primary competing bidder to project intimidation", "Next to the vendor to gauge their reaction", "Next to the coffee cart"], ans: 1 },

            { q: "What is the 'Downsizer Trap' on the Sunshine Coast?", options: ["Buying massive 5-bedroom homes that retirees do not want to clean", "Buying premium apartments that carry catastrophic body corporate fees and zero land value", "Buying in areas without hospital access", "Paying too much for a pool"], ans: 1 },
            { q: "When analyzing a market, what does 'Yield vs Dirt' mean?", options: ["Choosing between farming or property", "The delicate balance of securing enough rental yield to hold the asset without sacrificing raw land appreciation", "Choosing between apartments and houses", "Buying cheap land with no house"], ans: 1 },
            { q: "How do we position ourselves with a client's Accountant?", options: ["As a competitor", "As a collaborative fiduciary peer executing the wealth structures they design", "As their primary financial advisor", "We ignore the accountant"], ans: 1 },
            { q: "What is the danger of the 'Pre-Approval Expiry Loop'?", options: ["The client gets bored", "The client's 90-day finance window closes in a rising market, severely reducing their purchasing power when they re-apply", "The broker steals the client", "The bank charges a massive fee to renew"], ans: 1 },
            { q: "What is 'Tax-Loss Prevention: Land vs Brick'?", options: ["A strategy to avoid paying council rates", "Understanding that maximizing depreciation (brick) often means sacrificing the only thing that grows (land)", "Buying only brick properties for safety", "Buying commercial property only"], ans: 1 },

            { q: "Why do we target the 'Empty Nest' demographic for off-market stock?", options: ["They are easily confused", "They are sitting on large, unencumbered family homes and want a quiet, stress-free off-market exit", "They usually have distressed debt", "They always sell cheap"], ans: 1 },
            { q: "What is the 'Negative Question Strategy' in sales?", options: ["Insulting the client", "Asking 'Is it a ridiculous idea to...' which triggers the prospect to say 'No', creating psychological safety", "Asking 'Why wouldn't you buy this?'", "Only asking yes/no questions"], ans: 1 },
            { q: "What is the 'Access Gap' objection handling technique?", options: ["Explaining that we have a key to every house", "Demonstrating that unrepresented buyers literally cannot access the top 20% of premium inventory before it sells", "Showing them we have access to bank data", "Showing them how to use realestate.com.au"], ans: 1 },
            { q: "How do we handle the 'Priced Out' Danger calculation?", options: ["We tell them to buy further away", "We mathematically prove that waiting to save an extra $20k takes 2 years, during which the target asset has grown by $150k", "We show them cheaper sub-markets", "We advise them to rent forever"], ans: 1 },
            { q: "Why is 'Emotion' the enemy of capital growth?", options: ["Because it makes people cry", "Emotion causes buyers to overpay for aesthetics rather than intrinsic land value, destroying day-one equity", "Emotion makes clients change their minds too often", "It slows down the signing process"], ans: 1 },

            { q: "What is a 'CDC' in NSW?", options: ["Complying Development Certificate - a fast-track approval process if the build meets specific state codes", "Council Demolition Code", "Central Development Corridors", "Certified Dwelling Construction"], ans: 0 },
            { q: "What is the core risk of a 'Secondary Dwelling' (Granny Flat) strategy?", options: ["They are ugly", "Overcapitalizing on an asset where the resulting yield bump does not outpace the construction debt cost", "They require too much land", "Tenants complain too much"], ans: 1 },
            { q: "How does the Quantum off-market engine function?", options: ["By spamming thousands of flyers", "Through systematic, high-frequency relationship building with the top 5% of listing agents in our target corridors", "By targeting distressed properties on RealEstate.com.au", "By hacking agent databases"], ans: 1 },
            { q: "What is the critical failure point in 'State Warfare (VIC)'?", options: ["It's too cold", "Failing to account for aggressive land tax scaling and the specific Section 32 vendor disclosure nuances", "Misunderstanding the auction laws", "Earthquakes"], ans: 1 },
            { q: "What defines 'High-Stakes Negotiation'?", options: ["Yelling at the selling agent", "Remaining emotionally detached, controlling the timeline, and utilizing hard data to strip leverage from the vendor", "Walking away from every deal once", "Offering above asking price immediately"], ans: 1 },

            { q: "What is the Quantum philosophy on 'Post-Settlement'?", options: ["Our job is done when the keys hand over", "We maintain the relationship to monitor portfolio performance and trigger the Flywheel for purchase number 2", "We send them a gift basket and move on", "We hand them to a property manager and never speak again"], ans: 1 },
            { q: "Why must a BA have 'Data Superiority'?", options: ["To show off to the client", "Because whoever holds the most granular data in a negotiation controls the price outcome", "Because it makes the CRM look good", "To make pretty graphs"], ans: 1 },
            { q: "What happens if a Quantum BA breaks the Fiduciary Standard?", options: ["They get a warning", "Immediate termination. Trust is the only product we actually sell.", "They are suspended for a week", "They have to pay a fine"], ans: 1 },
            { q: "Why is the 'Stalled Listing Hijack' effective?", options: ["It steals clients from other agents", "It identifies exhausted vendors whose properties failed at auction, allowing us to negotiate aggressively on logic rather than hype", "It bypasses the selling agent entirely", "It's illegal but profitable"], ans: 1 },
            { q: "What is the ultimate goal of the Quantum Tactical Bible?", options: ["To memorize scripts", "To rewire your brain to think exclusively in terms of risk mitigation, capital allocation, and undeniable authority", "To provide a manual for cold calling", "To pass a test"], ans: 1 },

            // Final Batch
            { q: "In a negotiation, whoever speaks next after stating the price...", options: ["Wins", "Loses leverage by justifying the number", "Controls the frame", "Gets a discount"], ans: 1 },
            { q: "What is a 'Subject to Finance' clause?", options: ["A guarantee the bank will lend", "A risk-mitigation condition allowing the buyer to crash the contract without penalty if their loan is denied", "A clause that lowers the interest rate", "A request for a lower price"], ans: 1 },
            { q: "Why is 'Days on Market' (DOM) critical intel?", options: ["To know when the agent goes on holiday", "High DOM indicates vendor fatigue and holding costs, directly increasing buyer leverage", "It tells us if the property is structurally sound", "It dictates the agent's commission"], ans: 1 },
            { q: "What is the Quantum approach to 'Bidding Wars'?", options: ["Bid fast and aggressive", "We don't play. We pre-empt the war with a knock-out offer or we walk away. Emotion breeds overpayment.", "We bid in extremely small increments", "Wait until the end and bid $1,000 more"], ans: 1 },
            { q: "What defines a Quantum Agent?", options: ["A matchmaker", "A property searcher", "A financial firewall", "A tour guide"], ans: 2 }
        ];

        window.openMasterExam = function () {
            document.getElementById('master-exam-modal').classList.remove('hidden');
            const container = document.getElementById('exam-questions-container');
            let html = '';

            window.masterExamQuestions.forEach((q, i) => {
                // Shuffle options for Master Exam dynamically
                const shuffledOpts = q.options.map((opt, oIdx) => ({ text: opt, originalIdx: oIdx }));
                for (let k = shuffledOpts.length - 1; k > 0; k--) {
                    const j = Math.floor(Math.random() * (k + 1));
                    [shuffledOpts[k], shuffledOpts[j]] = [shuffledOpts[j], shuffledOpts[k]];
                }

                html += `<div class="bg-white p-8 rounded-2xl shadow-sm exam-q-block" data-idx="${i}">
                    <p class="font-bold text-lg text-brand-900 mb-4">${i + 1}. ${q.q}</p>
                    <div class="space-y-3">
                        ${shuffledOpts.map(optObj => `<label class="flex items-center p-4 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors"><input type="radio" name="q${i}" value="${optObj.originalIdx}" class="w-5 h-5 text-brand-accent mr-3 border-slate-300 focus:ring-brand-accent"><span class="text-slate-700 font-medium">${optObj.text}</span></label>`).join('')}
                    </div>
                </div>`;
            });
            container.innerHTML = html;
        }

        window.closeExam = function () {
            document.getElementById('master-exam-modal').classList.add('hidden');
        }

        window.submitExam = async function () {
            let score = 0;
            const total = window.masterExamQuestions.length;
            window.masterExamQuestions.forEach((q, i) => {
                const selected = document.querySelector(`input[name="q${i}"]:checked`);
                if (selected && parseInt(selected.value) === q.ans) score++;
            });

            const percentage = (score / total) * 100;
            let grade = '';
            let passed = false;
            let msg = '';

            if (percentage < 60) { grade = 'FAIL / C'; passed = false; msg = "You did not meet the strict Quantum Standard. A complete retake is required."; }
            else if (percentage < 75) { grade = 'B'; passed = true; msg = "Acceptable execution, but room for refinement."; }
            else if (percentage < 90) { grade = 'A'; passed = true; msg = "Excellent grasp of Quantum tactics."; }
            else { grade = 'A+'; passed = true; msg = "Flawless execution. Master Level achieved."; }

            document.getElementById('exam-questions-container').classList.add('hidden');
            document.getElementById('exam-actions').classList.add('hidden');
            const resContainer = document.getElementById('exam-results-container');

            resContainer.innerHTML = `
                <div class="text-6xl mb-6">${passed ? '🏆' : '💀'}</div>
                <h2 class="text-3xl font-serif font-bold text-brand-900 mb-2">Score: ${score}/${total} (${Math.round(percentage)}%)</h2>
                <div class="inline-block px-6 py-2 rounded-full font-bold text-xl mb-6 ${passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}">Grade: ${grade}</div>
                <p class="text-slate-600 mb-8">${msg}</p>
                <button onclick="${passed ? 'closeExam()' : 'openMasterExam(); document.getElementById(\'exam-questions-container\').classList.remove(\'hidden\'); document.getElementById(\'exam-actions\').classList.remove(\'hidden\'); document.getElementById(\'exam-results-container\').classList.add(\'hidden\');'}" class="bg-brand-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-brand-800 transition-colors">${passed ? 'Return to Dashboard' : 'Initiate Retake'}</button>
            `;
            resContainer.classList.remove('hidden');

            // Save exam stats to cloud
            window.userData.examScore = score;
            window.userData.examPercentage = percentage;
            window.userData.examGrade = grade;
            window.userData.examPassed = passed;

            if (passed) {
                window.userData.points += 1000;
            }
            await saveUserData();
        }
