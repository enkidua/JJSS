import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import WorkMate from './pages/WorkMate';
import WorkTraining from './pages/WorkTraining';
import AITools from './pages/AITools';
import UserManagement from './pages/UserManagement';
import BudgetManagement from './pages/BudgetManagement';
import Settings from './pages/Settings';
import VocationalEvaluation from './pages/VocationalEvaluation';
import InfoMate from './pages/InfoMate';

export default function App() {
    return (
        <HashRouter>
            <Routes>
                <Route element={<Layout />}>
                    <Route path="/" element={<Home />} />
                    <Route path="/manage" element={<UserManagement />} />
                    <Route path="/evaluation" element={<VocationalEvaluation />} />
                    <Route path="/training" element={<WorkTraining />} />
                    <Route path="/workmate" element={<WorkMate />} />
                    <Route path="/budget" element={<BudgetManagement />} />
                    <Route path="/tools" element={<AITools />} />
                    <Route path="/infomate" element={<InfoMate />} />
                    <Route path="/settings" element={<Settings />} />
                </Route>
            </Routes>
        </HashRouter>
    );
}
