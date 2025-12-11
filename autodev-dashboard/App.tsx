import React, { useState, useEffect, useCallback } from 'react';
import { 
  Activity, 
  Settings, 
  PlayCircle, 
  GitPullRequest, 
  Terminal, 
  LayoutDashboard,
  Cpu,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai"; // Import to check if it works, mainly for types
import { TaskStatus, SimulationTask, LogEntry, RepoConfig, SystemStats } from './types';
import { generateDevPlan } from './services/geminiService';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

// --- MOCK DATA ---
const INITIAL_STATS: SystemStats = {
  issuesProcessed: 142,
  prsCreated: 138,
  avgProcessingTime: 45,
  activeWorkers: 1
};

const INITIAL_REPOS: RepoConfig[] = [
  {
    id: '1',
    name: 'MBRAS/real-estate-platform',
    enabled: true,
    rootDirectory: 'src/',
    coreFiles: ['server.ts', 'routes.ts'],
    techStack: 'TypeScript, Next.js'
  },
  {
    id: '2',
    name: 'IBVI/valuation-engine',
    enabled: true,
    rootDirectory: 'crates/',
    coreFiles: ['main.rs', 'lib.rs'],
    techStack: 'Rust, PostgreSQL'
  },
  {
    id: '3',
    name: 'MbInteligen/intel-core',
    enabled: false,
    rootDirectory: 'app/',
    coreFiles: ['main.py'],
    techStack: 'Python'
  }
];

// --- COMPONENTS ---

// 1. Sidebar
const Sidebar = ({ activeTab, setActiveTab }: { activeTab: string, setActiveTab: (t: string) => void }) => {
  const items = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'simulate', icon: PlayCircle, label: 'Simulator' },
    { id: 'settings', icon: Settings, label: 'Configuration' },
    { id: 'logs', icon: Terminal, label: 'System Logs' },
  ];

  return (
    <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full fixed left-0 top-0">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <Cpu className="text-white w-5 h-5" />
        </div>
        <div>
          <h1 className="font-bold text-lg text-white tracking-tight">AutoDev</h1>
          <span className="text-xs text-slate-500 font-mono">v1.0.0-phase1</span>
        </div>
      </div>
      
      <nav className="flex-1 px-4 py-4 space-y-2">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === item.id 
                ? 'bg-blue-600/10 text-blue-400 border border-blue-600/20' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 text-slate-500 text-xs">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          System Operational
        </div>
      </div>
    </div>
  );
};

// 2. Dashboard View
const Dashboard = ({ stats, tasks }: { stats: SystemStats, tasks: SimulationTask[] }) => {
  const chartData = [
    { name: 'Mon', prs: 12 },
    { name: 'Tue', prs: 19 },
    { name: 'Wed', prs: 15 },
    { name: 'Thu', prs: 22 },
    { name: 'Fri', prs: 18 },
    { name: 'Sat', prs: 8 },
    { name: 'Sun', prs: 5 },
  ];

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">System Overview</h2>
          <p className="text-slate-400">Monitoring autonomous development pipeline.</p>
        </div>
        <div className="flex gap-2">
            <span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-medium flex items-center gap-2">
                <ShieldCheck className="w-3 h-3" /> All Guardrails Active
            </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Issues Processed', value: stats.issuesProcessed, icon: Activity, color: 'text-blue-400' },
          { label: 'Draft PRs Created', value: stats.prsCreated, icon: GitPullRequest, color: 'text-purple-400' },
          { label: 'Avg Process Time', value: `${stats.avgProcessingTime}s`, icon: Cpu, color: 'text-amber-400' },
          { label: 'Active Workers', value: stats.activeWorkers, icon: Terminal, color: 'text-emerald-400' },
        ].map((stat, i) => (
          <div key={i} className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
            <div className="flex justify-between items-start mb-4">
              <div className={`p-2 bg-slate-800 rounded-lg ${stat.color}`}>
                <stat.icon className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
            <div className="text-sm text-slate-500">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Chart */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 p-6 rounded-xl h-[400px]">
          <h3 className="text-lg font-semibold text-white mb-6">Weekly PR Generation</h3>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
              <XAxis dataKey="name" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', color: '#fff' }}
                cursor={{ fill: '#1e293b' }}
              />
              <Bar dataKey="prs" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent Activity Feed */}
        <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl overflow-hidden flex flex-col">
          <h3 className="text-lg font-semibold text-white mb-4">Recent Tasks</h3>
          <div className="flex-1 overflow-y-auto pr-2 space-y-4 scrollbar-hide">
            {tasks.length === 0 ? (
                <div className="text-center text-slate-500 py-10">No recent tasks</div>
            ) : tasks.slice().reverse().map((task) => (
              <div key={task.id} className="p-3 bg-slate-800/50 rounded-lg border border-slate-800">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-mono text-blue-400 bg-blue-900/20 px-1.5 py-0.5 rounded">{task.repoName}</span>
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                    task.status === TaskStatus.COMPLETED ? 'bg-emerald-500/10 text-emerald-400' :
                    task.status === TaskStatus.FAILED ? 'bg-red-500/10 text-red-400' :
                    'bg-amber-500/10 text-amber-400'
                  }`}>
                    {task.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="text-sm text-slate-200 font-medium truncate">{task.issueTitle}</div>
                {task.prUrl && (
                  <a href="#" className="text-xs text-slate-500 hover:text-blue-400 flex items-center gap-1 mt-2">
                    <GitPullRequest className="w-3 h-3" /> PR #{Math.floor(Math.random() * 1000)}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// 3. Simulator View
const Simulator = ({ 
  apiKey, 
  setApiKey, 
  startSimulation 
}: { 
  apiKey: string, 
  setApiKey: (k: string) => void, 
  startSimulation: (repo: string, title: string, body: string) => void 
}) => {
  const [repo, setRepo] = useState(INITIAL_REPOS[0].name);
  const [title, setTitle] = useState("Fix null pointer in user authentication");
  const [body, setBody] = useState("The user object is sometimes null when the session expires, causing a crash in the validation middleware. We should check for existence before accessing properties.");
  const [isSimulating, setIsSimulating] = useState(false);

  const handleSimulate = () => {
    if (!apiKey) {
      alert("Please enter a Gemini API Key to run the simulation.");
      return;
    }
    setIsSimulating(true);
    startSimulation(repo, title, body);
    // Reset local simulating state after a delay or let parent handle it? 
    // For now, simple timeout to re-enable button
    setTimeout(() => setIsSimulating(false), 2000); 
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Pipeline Simulator</h2>
        <p className="text-slate-400">Trigger a mock webhook event to test the AutoDev workflow in real-time.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Input Form */}
        <div className="md:col-span-1 space-y-6">
           <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl space-y-4">
             <div>
               <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Gemini API Key</label>
               <input 
                 type="password" 
                 value={apiKey}
                 onChange={(e) => setApiKey(e.target.value)}
                 className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                 placeholder="sk-..."
               />
               <p className="text-[10px] text-slate-600 mt-1">Required for LLM step.</p>
             </div>

             <div>
               <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Target Repository</label>
               <select 
                 value={repo}
                 onChange={(e) => setRepo(e.target.value)}
                 className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
               >
                 {INITIAL_REPOS.filter(r => r.enabled).map(r => (
                   <option key={r.id} value={r.name}>{r.name}</option>
                 ))}
               </select>
             </div>

             <div>
               <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Issue Title</label>
               <input 
                 type="text" 
                 value={title}
                 onChange={(e) => setTitle(e.target.value)}
                 className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
               />
             </div>

             <div>
               <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Issue Description</label>
               <textarea 
                 value={body}
                 onChange={(e) => setBody(e.target.value)}
                 rows={6}
                 className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
               />
             </div>

             <button 
               onClick={handleSimulate}
               disabled={isSimulating}
               className={`w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${
                 isSimulating 
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20'
               }`}
             >
               {isSimulating ? 'Triggering...' : <><PlayCircle className="w-4 h-4" /> Trigger Webhook</>}
             </button>
           </div>
        </div>

        {/* Visualizer */}
        <div className="md:col-span-2">
             <TaskVisualizer />
        </div>
      </div>
    </div>
  );
};

// 3.1 Task Visualizer (Consumes global active task)
// Ideally passed as prop, but simplifying for single-file feel structure
const TaskVisualizer = () => {
  // This component will just render "No Active Task" or the details of the running task
  // Since we are lifting state up, we will receive the current active task from props in real impl.
  // For this demo, we'll use a specific ID if available. 
  // NOTE: For the purpose of this single-file, I will assume the parent passes the active task logic.
  // But wait, the parent `Simulator` doesn't hold the task state, `App` does.
  // I will make `TaskVisualizer` consume context or props. Let's use Props passed down.
  return null; // Placeholder, actual implementation inside App's render
};


// 4. Configuration View
const Configuration = () => {
  const [repos, setRepos] = useState<RepoConfig[]>(INITIAL_REPOS);

  const toggleRepo = (id: string) => {
    setRepos(repos.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Repository Configuration</h2>
          <p className="text-slate-400">Manage allowlists, root directories, and stack definitions.</p>
        </div>
        <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-500">
          Add Repository
        </button>
      </div>

      <div className="space-y-4">
        {repos.map((repo) => (
          <div key={repo.id} className={`bg-slate-900 border ${repo.enabled ? 'border-slate-800' : 'border-slate-800 opacity-60'} rounded-xl p-6 transition-all`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                 <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${repo.enabled ? 'bg-slate-800 text-blue-400' : 'bg-slate-900 text-slate-600'}`}>
                    <GitPullRequest className="w-5 h-5" />
                 </div>
                 <div>
                   <h3 className="font-bold text-white text-lg">{repo.name}</h3>
                   <div className="flex items-center gap-3 mt-1">
                     <span className="text-xs text-slate-500 font-mono bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                       {repo.rootDirectory}
                     </span>
                     <span className="text-xs text-slate-500">{repo.techStack}</span>
                   </div>
                 </div>
              </div>
              <div className="flex items-center gap-4">
                 <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={repo.enabled} onChange={() => toggleRepo(repo.id)} className="sr-only peer" />
                    <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
              </div>
            </div>
            
            {repo.enabled && (
              <div className="mt-6 pt-6 border-t border-slate-800 grid grid-cols-2 gap-4">
                 <div>
                   <span className="text-xs font-semibold text-slate-500 uppercase">Core Files</span>
                   <div className="mt-2 flex flex-wrap gap-2">
                     {repo.coreFiles.map(f => (
                       <span key={f} className="text-xs text-slate-300 bg-slate-800 px-2 py-1 rounded border border-slate-700">{f}</span>
                     ))}
                   </div>
                 </div>
                 <div>
                    <span className="text-xs font-semibold text-slate-500 uppercase">Guardrails</span>
                    <div className="mt-2 text-xs text-emerald-400 flex items-center gap-2">
                      <ShieldCheck className="w-3 h-3" />
                      Strict mode enabled
                    </div>
                 </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// 5. Logs View
const LogsView = ({ logs }: { logs: LogEntry[] }) => {
  return (
    <div className="p-8 h-screen flex flex-col">
       <div className="mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">System Logs</h2>
          <p className="text-slate-400">Real-time event stream from all microservices.</p>
       </div>
       <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-hidden flex flex-col font-mono text-sm">
          <div className="flex-1 overflow-y-auto space-y-2 scrollbar-hide">
            {logs.length === 0 && <div className="text-slate-600 italic">No logs generated yet.</div>}
            {logs.map((log) => (
              <div key={log.id} className="flex gap-4 hover:bg-slate-900/50 p-1 rounded">
                <span className="text-slate-500 shrink-0 w-24">{log.timestamp.split('T')[1].split('.')[0]}</span>
                <span className={`shrink-0 w-16 font-bold ${
                  log.level === 'INFO' ? 'text-blue-400' :
                  log.level === 'SUCCESS' ? 'text-emerald-400' :
                  log.level === 'WARN' ? 'text-amber-400' : 'text-red-400'
                }`}>{log.level}</span>
                <span className="text-purple-400 shrink-0 w-24">[{log.component}]</span>
                <span className="text-slate-300 break-all">{log.message}</span>
              </div>
            ))}
          </div>
       </div>
    </div>
  );
};

// --- MAIN APP ---

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [apiKey, setApiKey] = useState(process.env.API_KEY || '');
  const [tasks, setTasks] = useState<SimulationTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Helper to add log
  const addLog = useCallback((component: LogEntry['component'], message: string, level: LogEntry['level'] = 'INFO') => {
    const entry: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      component,
      message,
      level
    };
    setLogs(prev => [entry, ...prev]);
  }, []);

  // Simulation Logic
  const startSimulation = useCallback(async (repoName: string, issueTitle: string, issueBody: string) => {
    const newTaskId = Math.random().toString(36).substr(2, 9);
    const newTask: SimulationTask = {
      id: newTaskId,
      repoName,
      issueTitle,
      issueBody,
      status: TaskStatus.QUEUED,
      logs: [],
      startTime: Date.now()
    };

    setTasks(prev => [newTask, ...prev]);
    setActiveTaskId(newTaskId);
    addLog('Webhook', `Received issue event from ${repoName}`, 'INFO');

    // Step 1: Validate
    setTimeout(() => {
      updateTaskStatus(newTaskId, TaskStatus.VALIDATING);
      addLog('Webhook', `Validating signature and allowlist for ${repoName}`, 'INFO');
    }, 1000);

    // Step 2: Orchestrator Pick up
    setTimeout(() => {
      updateTaskStatus(newTaskId, TaskStatus.CLONING);
      addLog('Orchestrator', `Cloning repository ${repoName} to isolate environment`, 'INFO');
    }, 2500);

    // Step 3: Context
    setTimeout(() => {
      updateTaskStatus(newTaskId, TaskStatus.CONTEXT_BUILDING);
      addLog('Orchestrator', `Building context from core files and README`, 'INFO');
    }, 4500);

    // Step 4: LLM
    setTimeout(async () => {
      updateTaskStatus(newTaskId, TaskStatus.LLM_PROCESSING);
      addLog('LLM', `Sending context to Gemini 2.5 Flash...`, 'INFO');
      
      let plan = "Simulated Plan: Modifying server.ts to handle null checks.";
      try {
        if (apiKey) {
           plan = await generateDevPlan(apiKey, issueTitle, issueBody, repoName);
        } else {
           addLog('LLM', 'No API Key provided, using mock response', 'WARN');
        }
        
        updateTask(newTaskId, { llmPlan: plan });
        addLog('LLM', `Generated implementation plan (${plan.length} chars)`, 'SUCCESS');
      } catch (e) {
        addLog('LLM', `Failed to generate plan: ${e}`, 'ERROR');
      }
      
      // Step 5: PR
      setTimeout(() => {
        updateTaskStatus(newTaskId, TaskStatus.CREATING_PR);
        addLog('GitHub', `Creating branch autodev/issue-${Math.floor(Math.random() * 100)}`, 'INFO');
        addLog('GitHub', `Pushing changes and opening Draft PR`, 'SUCCESS');
        updateTask(newTaskId, { prUrl: 'https://github.com/org/repo/pull/123' });
      }, 3000);

       // Step 6: Linear
      setTimeout(() => {
        updateTaskStatus(newTaskId, TaskStatus.UPDATING_LINEAR);
        addLog('Linear', `Found linked issue LIN-1429`, 'INFO');
        addLog('Linear', `Updated status to "In Review"`, 'SUCCESS');
        updateTask(newTaskId, { linearUrl: 'https://linear.app/org/issue/LIN-1429' });
      }, 5000);

      // Finish
      setTimeout(() => {
        updateTaskStatus(newTaskId, TaskStatus.COMPLETED);
        addLog('Orchestrator', `Task ${newTaskId} completed successfully`, 'SUCCESS');
      }, 6500);

    }, 6500);

  }, [addLog, apiKey]);

  const updateTaskStatus = (id: string, status: TaskStatus) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
  };

  const updateTask = (id: string, updates: Partial<SimulationTask>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const activeTask = tasks.find(t => t.id === activeTaskId);

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="ml-64 flex-1 overflow-auto bg-slate-950">
        {activeTab === 'dashboard' && <Dashboard stats={INITIAL_STATS} tasks={tasks} />}
        
        {activeTab === 'simulate' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0 min-h-screen">
             <div className="md:col-span-1 border-r border-slate-900">
               <Simulator apiKey={apiKey} setApiKey={setApiKey} startSimulation={startSimulation} />
             </div>
             <div className="md:col-span-2 bg-slate-900/30 p-8">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-500" /> Live Execution Context
                </h3>
                {activeTask ? (
                  <div className="space-y-8">
                     {/* Progress Stepper */}
                     <div className="flex justify-between items-center relative">
                        <div className="absolute left-0 top-1/2 w-full h-0.5 bg-slate-800 -z-10"></div>
                        {[
                          { s: TaskStatus.VALIDATING, label: 'Validate' },
                          { s: TaskStatus.CLONING, label: 'Clone' },
                          { s: TaskStatus.LLM_PROCESSING, label: 'Plan Code' },
                          { s: TaskStatus.CREATING_PR, label: 'Create PR' },
                          { s: TaskStatus.COMPLETED, label: 'Done' }
                        ].map((step, idx) => {
                           const isCompleted = getStepStatus(activeTask.status) > idx;
                           const isCurrent = getStepStatus(activeTask.status) === idx;
                           return (
                             <div key={idx} className="flex flex-col items-center gap-2 bg-slate-900 px-2">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all ${
                                   isCompleted ? 'bg-emerald-500 border-emerald-500 text-white' :
                                   isCurrent ? 'bg-blue-600 border-blue-500 text-white animate-pulse' :
                                   'bg-slate-800 border-slate-700 text-slate-500'
                                }`}>
                                   {isCompleted ? <ShieldCheck className="w-4 h-4" /> : <span className="text-xs font-bold">{idx + 1}</span>}
                                </div>
                                <span className={`text-xs font-medium ${isCurrent ? 'text-blue-400' : 'text-slate-500'}`}>{step.label}</span>
                             </div>
                           )
                        })}
                     </div>

                     {/* Plan Output */}
                     <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
                        <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">LLM Strategy</h4>
                        {activeTask.llmPlan ? (
                          <div className="prose prose-invert prose-sm max-w-none font-mono text-slate-300">
                             <pre className="whitespace-pre-wrap bg-slate-950 p-4 rounded-lg border border-slate-800 text-xs">
                               {activeTask.llmPlan}
                             </pre>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center h-32 text-slate-600 italic gap-2">
                             {activeTask.status === TaskStatus.LLM_PROCESSING ? (
                               <><Cpu className="w-5 h-5 animate-spin" /> Thinking...</>
                             ) : "Waiting for context..."}
                          </div>
                        )}
                     </div>

                     {/* Artifacts */}
                     {(activeTask.prUrl || activeTask.linearUrl) && (
                       <div className="grid grid-cols-2 gap-4">
                          {activeTask.prUrl && (
                             <a href="#" className="flex items-center gap-3 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-blue-500 rounded-lg group transition-all">
                                <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg group-hover:bg-purple-500 group-hover:text-white transition-colors">
                                  <GitPullRequest className="w-5 h-5" />
                                </div>
                                <div>
                                  <div className="text-sm font-semibold text-white">Draft PR Created</div>
                                  <div className="text-xs text-slate-400">#402 • Ready for review</div>
                                </div>
                             </a>
                          )}
                          {activeTask.linearUrl && (
                             <a href="#" className="flex items-center gap-3 p-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-blue-500 rounded-lg group transition-all">
                                <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                  <LayoutDashboard className="w-5 h-5" />
                                </div>
                                <div>
                                  <div className="text-sm font-semibold text-white">Linear Updated</div>
                                  <div className="text-xs text-slate-400">LIN-1429 • In Review</div>
                                </div>
                             </a>
                          )}
                       </div>
                     )}

                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-600">
                    <AlertCircle className="w-12 h-12 mb-4 opacity-50" />
                    <p>No active simulation task.</p>
                    <p className="text-sm">Use the form to trigger a webhook event.</p>
                  </div>
                )}
             </div>
          </div>
        )}
        
        {activeTab === 'settings' && <Configuration />}
        
        {activeTab === 'logs' && <LogsView logs={logs} />}
      </main>
    </div>
  );
}

// Helper for step index
function getStepStatus(status: TaskStatus): number {
  switch (status) {
    case TaskStatus.QUEUED: return 0;
    case TaskStatus.VALIDATING: return 0;
    case TaskStatus.CLONING: return 1;
    case TaskStatus.CONTEXT_BUILDING: return 2;
    case TaskStatus.LLM_PROCESSING: return 2;
    case TaskStatus.CREATING_PR: return 3;
    case TaskStatus.UPDATING_LINEAR: return 3;
    case TaskStatus.COMPLETED: return 4;
    default: return 0;
  }
}

export default App;