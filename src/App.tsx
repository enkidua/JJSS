import { HashRouter, Routes, Route, Link } from 'react-router-dom';
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
import RehabWorkflow from './pages/RehabWorkflow';

export default function App() {
    return (
        <HashRouter>
            <Routes>
                <Route element={<Layout />}>
                    <Route path="/" element={<Home />} />
                    <Route path="/manage" element={<UserManagement />} />
                    <Route path="/overview" element={<RehabWorkflow />} />
                    <Route path="/evaluation" element={<VocationalEvaluation />} />
                    <Route path="/training" element={<WorkTraining />} />
                    <Route path="/workmate" element={<WorkMate />} />
                    <Route path="/budget" element={<BudgetManagement />} />
                    <Route path="/tools" element={<AITools />} />
                    <Route path="/infomate" element={<InfoMate />} />
                    <Route path="/settings" element={<Settings />} />
                    <Route path="*" element={
                        <div className="mx-auto max-w-xl px-6 py-20 text-center">
                            <h1 className="section-title mb-4">페이지를 찾을 수 없습니다</h1>
                            <p className="mb-6 text-white/70">주소가 바뀌었거나 잘못된 주소입니다. 상단 메뉴에서 업무를 선택해 주세요.</p>
                            <Link to="/" className="btn-primary inline-flex">홈으로 이동</Link>
                        </div>
                    } />
                </Route>
            </Routes>
        </HashRouter>
    );
}
