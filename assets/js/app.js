// Core Platform State
const platformState = {
    currentUser: {
        name: "Commander Sarah Jenkins",
        role: "Director of Market Operations",
        level: 42,
        xp: 14500,
        nextLevelXp: 18000,
        team: "Alpha Squadron",
        achievements: 18
    },
    currentModule: "negotiation-tactics-advanced",
    progress: {
        overall: 78,
        modulesCompleted: 12,
        activeStreaks: 5 // Days
    }
};

// Initialize Charts
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    initializePerformanceChart();
    initializeSkillRadar();
    fetchAILearningPath(); // Mock AI feature
});

function initializePerformanceChart() {
    const ctx = document.getElementById('performanceChart');
    if (!ctx) return;
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6'],
            datasets: [{
                label: 'Tactical Score',
                data: [65, 70, 68, 85, 82, 90],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, max: 100, grid: { color: 'rgba(0,0,0,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });
}

function initializeSkillRadar() {
    const ctx = document.getElementById('skillRadar');
    if (!ctx) return;

    new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Negotation', 'Market Analysis', 'Client Comm.', 'Lead Gen', 'Closing', 'Tech Adaptability'],
            datasets: [{
                label: 'Current Proficiency',
                data: [85, 90, 75, 80, 88, 70],
                backgroundColor: 'rgba(34, 197, 94, 0.2)',
                borderColor: '#22c55e',
                pointBackgroundColor: '#22c55e'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: { angleLines: { color: 'rgba(0,0,0,0.1)' }, grid: { color: 'rgba(0,0,0,0.1)' }, pointLabels: { font: { family: 'Inter', size: 11 } }, ticks: { display: false } }
            }
        }
    });
}

// --- Interactive Features ---

function toggleModule(moduleId) {
    const content = document.getElementById(`module-content-${moduleId}`);
    const icon = document.getElementById(`module-icon-${moduleId}`);
    if (content.classList.contains('hidden')) {
        content.classList.remove('hidden');
        icon.style.transform = 'rotate(90deg)';
    } else {
        content.classList.add('hidden');
        icon.style.transform = 'rotate(0deg)';
    }
}

function startScenario(scenarioId) {
    const modal = document.getElementById('scenarioModal');
    modal.classList.remove('hidden');
    // In a real app, fetch scenario data securely
    document.getElementById('scenarioContent').innerHTML = `
        <h3 class="text-xl font-bold mb-4">Tactical Scenario: The Hesitant Seller</h3>
        <p class="text-gray-600 mb-6 font-serif">Client objects to the 5% commission rate, citing a discount broker offering 1.5%. Time is critical.</p>
        <div class="space-y-3">
            <button onclick="handleScenarioResponse(1)" class="w-full text-left p-4 rounded bg-gray-50 hover:bg-brand-50 border border-gray-200 hover:border-brand-accent transition-colors">
                "I understand. However, our marketing reach guarantees a higher sale price, offsetting the fee."
            </button>
            <button onclick="handleScenarioResponse(2)" class="w-full text-left p-4 rounded bg-gray-50 hover:bg-brand-50 border border-gray-200 hover:border-brand-accent transition-colors">
                "Discount brokers do the minimum. I manage the entire process, reducing your stress."
            </button>
            <button onclick="handleScenarioResponse(3)" class="w-full text-left p-4 rounded bg-gray-50 hover:bg-brand-50 border border-gray-200 hover:border-brand-accent transition-colors focus:ring-2 focus:ring-brand-accent">
                "Let's look at the net sheet. It's not about what you pay, it's about what you keep. Here's how my strategy maximizes your net."
            </button>
        </div>
    `;
}

function closeScenario() {
    document.getElementById('scenarioModal').classList.add('hidden');
}

function handleScenarioResponse(option) {
    const content = document.getElementById('scenarioContent');
    if (option === 3) {
         content.innerHTML = `
            <div class="text-center py-8">
                <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-600 mb-4 animate-[bounce_1s_infinite]">
                    <i data-lucide="check" class="w-8 h-8"></i>
                </div>
                <h3 class="text-2xl font-bold text-gray-900 mb-2">Tactical Success</h3>
                <p class="text-gray-600 mb-6 font-serif">Perfect execution. Shifting focus from cost to net outcome is the strongest counter-maneuver.</p>
                <p class="text-sm font-bold text-brand-accent mb-6">+500 XP Earned</p>
                <button onclick="closeScenario()" class="px-6 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 transition-colors">Return to Dashboard</button>
            </div>
        `;
        lucide.createIcons(); // Re-initialize icons for new DOM
    } else {
         content.innerHTML = `
            <div class="text-center py-8 animate-fade-in">
                 <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 text-red-600 mb-4">
                    <i data-lucide="x" class="w-8 h-8"></i>
                </div>
                <h3 class="text-xl font-bold text-gray-900 mb-2">Sub-optimal Response</h3>
                <p class="text-gray-600 mb-6 font-serif">While accurate, this response is defensive. Focus on the client's ultimate goal: net profit.</p>
                <button onclick="startScenario('hesitant-seller')" class="px-6 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors">Retry Scenario</button>
            </div>
         `;
         lucide.createIcons();
    }
}

// Mock AI interaction
async function fetchAILearningPath() {
     const aiStatus = document.getElementById('ai-tutor-status');
     await new Promise(r => setTimeout(r, 1500)); // Simulate thinking
     if(aiStatus) aiStatus.innerHTML = `<span class="text-sm font-medium text-green-700 bg-green-50 px-2 py-1 rounded">Path Optimized for 'Negotiation' closing rate (+12%)</span>`;
}

window.submitQuickQuiz = function() {
    alert('Quiz submitted! Analytics updating...');
}

window.playModuleAudio = async function() {
    alert('Audio playback needs to be connected to the backend.');
}
