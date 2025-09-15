---
tags:
  - Saga Pattern
  - Monitoring
  - Dashboard
  - TypeScript React
  - Observability
---

# 16.4d Saga 패턴 - 모니터링과 관리

## 🔍 Saga 패턴 모니터링과 관리

실시간 Saga 상태 추적 및 오퍼레이션을 위한 포괄적인 모니터링 시스템을 다룹니다.

### 실시간 Saga 상태 추적 대시보드

```typescript
// React + TypeScript로 구현한 Saga 모니터링 대시보드
import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell } from 'recharts';

interface SagaState {
  sagaId: string;
  sagaType: string;
  orderId?: string;
  customerId?: string;
  status: 'STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'COMPENSATING' | 'COMPENSATED' | 'FAILED';
  currentStep: string;
  executedSteps: string[];
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
  totalSteps: number;
  progress: number; // 0-100
}

interface SagaMetrics {
  totalSagas: number;
  completedSagas: number;
  failedSagas: number;
  compensatedSagas: number;
  averageCompletionTime: number;
  successRate: number;
  throughputPerHour: number;
}

const SagaMonitoringDashboard: React.FC = () => {
  const [sagas, setSagas] = useState<SagaState[]>([]);
  const [metrics, setMetrics] = useState<SagaMetrics>({
    totalSagas: 0,
    completedSagas: 0,
    failedSagas: 0,
    compensatedSagas: 0,
    averageCompletionTime: 0,
    successRate: 0,
    throughputPerHour: 0
  });
  const [selectedSaga, setSelectedSaga] = useState<SagaState | null>(null);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d'>('24h');

  // 실시간 데이터 구독
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080/saga-monitoring');
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'SAGA_UPDATE') {
        setSagas(prev => {
          const index = prev.findIndex(s => s.sagaId === data.saga.sagaId);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = data.saga;
            return updated;
          } else {
            return [data.saga, ...prev].slice(0, 100); // 최근 100개만 유지
          }
        });
      } else if (data.type === 'METRICS_UPDATE') {
        setMetrics(data.metrics);
      }
    };

    return () => ws.close();
  }, []);

  // Saga 상태별 색상 정의
  const getStatusColor = (status: SagaState['status']) => {
    switch (status) {
      case 'COMPLETED': return '#4ade80'; // 초록
      case 'IN_PROGRESS': return '#3b82f6'; // 파랑  
      case 'COMPENSATING': return '#f59e0b'; // 주황
      case 'COMPENSATED': return '#8b5cf6'; // 보라
      case 'FAILED': return '#ef4444'; // 빨강
      default: return '#6b7280'; // 회색
    }
  };

  // 파이 차트 데이터
  const statusDistribution = [
    { name: '완료', value: metrics.completedSagas, color: '#4ade80' },
    { name: '실패', value: metrics.failedSagas, color: '#ef4444' },
    { name: '보상', value: metrics.compensatedSagas, color: '#8b5cf6' },
    { name: '진행중', value: metrics.totalSagas - metrics.completedSagas - metrics.failedSagas - metrics.compensatedSagas, color: '#3b82f6' }
  ];

  return (
    <div className="p-6 bg-gray-100 min-h-screen">
      <h1 className="text-3xl font-bold mb-6">🎭 Saga 모니터링 대시보드</h1>
      
      {/* 핵심 메트릭 카드들 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="총 Saga 수"
          value={metrics.totalSagas}
          icon="📊"
          color="bg-blue-500"
        />
        <MetricCard
          title="성공률"
          value={`${metrics.successRate.toFixed(1)}%`}
          icon="✅"
          color="bg-green-500"
        />
        <MetricCard
          title="평균 완료 시간"
          value={`${metrics.averageCompletionTime.toFixed(1)}s`}
          icon="⏱️"
          color="bg-yellow-500"
        />
        <MetricCard
          title="시간당 처리량"
          value={`${metrics.throughputPerHour}`}
          icon="🚀"
          color="bg-purple-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Saga 상태 분포 */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">📈 Saga 상태 분포</h2>
          <PieChart width={400} height={300}>
            <Pie
              data={statusDistribution}
              cx={200}
              cy={150}
              labelLine={false}
              label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
              outerRadius={100}
              fill="#8884d8"
              dataKey="value"
            >
              {statusDistribution.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </div>

        {/* 실시간 Saga 목록 */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">📋 실시간 Saga 목록</h2>
          <div className="max-h-80 overflow-y-auto">
            {sagas.map((saga) => (
              <div
                key={saga.sagaId}
                className="border-l-4 pl-4 py-3 mb-3 cursor-pointer hover:bg-gray-50"
                style={{ borderLeftColor: getStatusColor(saga.status) }}
                onClick={() => setSelectedSaga(saga)}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-medium">주문 {saga.orderId}</span>
                    <span className="text-sm text-gray-500 ml-2">
                      {saga.currentStep}
                    </span>
                  </div>
                  <div className="text-right">
                    <div className={`inline-block px-2 py-1 rounded text-xs font-medium text-white`}
                         style={{ backgroundColor: getStatusColor(saga.status) }}>
                      {saga.status}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {saga.progress}% 완료
                    </div>
                  </div>
                </div>
                
                {/* 진행률 바 */}
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div
                    className="h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${saga.progress}%`,
                      backgroundColor: getStatusColor(saga.status)
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 상세 Saga 정보 모달 */}
      {selectedSaga && (
        <SagaDetailModal
          saga={selectedSaga}
          onClose={() => setSelectedSaga(null)}
        />
      )}
    </div>
  );
};

const MetricCard: React.FC<{
  title: string;
  value: string | number;
  icon: string;
  color: string;
}> = ({ title, value, icon, color }) => (
  <div className="bg-white rounded-lg shadow-md p-6">
    <div className="flex items-center">
      <div className={`${color} rounded-lg p-3 text-white text-2xl mr-4`}>
        {icon}
      </div>
      <div>
        <p className="text-gray-500 text-sm">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  </div>
);

const SagaDetailModal: React.FC<{
  saga: SagaState;
  onClose: () => void;
}> = ({ saga, onClose }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-screen overflow-y-auto">
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">🔍 Saga 상세 정보</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="font-semibold mb-3">📋 기본 정보</h3>
            <div className="space-y-2 text-sm">
              <div><strong>Saga ID:</strong> {saga.sagaId}</div>
              <div><strong>주문 ID:</strong> {saga.orderId}</div>
              <div><strong>고객 ID:</strong> {saga.customerId}</div>
              <div><strong>상태:</strong> 
                <span className={`ml-2 px-2 py-1 rounded text-xs font-medium text-white`}
                     style={{ backgroundColor: getStatusColor(saga.status) }}>
                  {saga.status}
                </span>
              </div>
              <div><strong>현재 단계:</strong> {saga.currentStep}</div>
              <div><strong>진행률:</strong> {saga.progress}%</div>
            </div>
          </div>
          
          <div>
            <h3 className="font-semibold mb-3">⏰ 시간 정보</h3>
            <div className="space-y-2 text-sm">
              <div><strong>시작 시간:</strong> {saga.createdAt.toLocaleString()}</div>
              <div><strong>마지막 업데이트:</strong> {saga.updatedAt.toLocaleString()}</div>
              {saga.completedAt && (
                <div><strong>완료 시간:</strong> {saga.completedAt.toLocaleString()}</div>
              )}
              <div><strong>소요 시간:</strong> {
                saga.completedAt 
                  ? `${Math.round((saga.completedAt.getTime() - saga.createdAt.getTime()) / 1000)}초`
                  : `${Math.round((new Date().getTime() - saga.createdAt.getTime()) / 1000)}초 (진행중)`
              }</div>
            </div>
          </div>
        </div>
        
        <div className="mt-6">
          <h3 className="font-semibold mb-3">🔄 실행된 단계들</h3>
          <div className="flex flex-wrap gap-2">
            {saga.executedSteps.map((step, index) => (
              <span
                key={index}
                className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm"
              >
                {step}
              </span>
            ))}
          </div>
        </div>
        
        {saga.errorMessage && (
          <div className="mt-6">
            <h3 className="font-semibold mb-3 text-red-600">❌ 오류 정보</h3>
            <div className="bg-red-50 border border-red-200 rounded p-4 text-red-800 text-sm">
              {saga.errorMessage}
            </div>
          </div>
        )}
        
        <div className="mt-8">
          <h3 className="font-semibold mb-3">📊 단계별 진행 상황</h3>
          <SagaProgressTimeline saga={saga} />
        </div>
      </div>
    </div>
  </div>
);

const SagaProgressTimeline: React.FC<{ saga: SagaState }> = ({ saga }) => {
  const steps = [
    { name: '주문 생성', key: 'ORDER_CREATED' },
    { name: '재고 예약', key: 'INVENTORY_RESERVED' },
    { name: '결제 처리', key: 'PAYMENT_PROCESSED' },
    { name: '포인트 차감', key: 'POINTS_DEDUCTED' },
    { name: '배송 생성', key: 'SHIPMENT_CREATED' },
    { name: '알림 발송', key: 'NOTIFICATION_SENT' }
  ];
  
  return (
    <div className="space-y-4">
      {steps.map((step, index) => {
        const isCompleted = saga.executedSteps.includes(step.key);
        const isCurrent = saga.currentStep === step.key;
        
        return (
          <div key={step.key} className="flex items-center">
            <div className={`w-4 h-4 rounded-full mr-4 ${
              isCompleted ? 'bg-green-500' : 
              isCurrent ? 'bg-blue-500 animate-pulse' : 
              'bg-gray-300'
            }`}></div>
            <span className={`${
              isCompleted ? 'text-green-700 font-medium' :
              isCurrent ? 'text-blue-700 font-medium' :
              'text-gray-500'
            }`}>
              {step.name}
            </span>
            {isCompleted && <span className="ml-2 text-green-600">✓</span>}
            {isCurrent && <span className="ml-2 text-blue-600">⏳</span>}
          </div>
        );
      })}
    </div>
  );
};

function getStatusColor(status: SagaState['status']): string {
  switch (status) {
    case 'COMPLETED': return '#4ade80';
    case 'IN_PROGRESS': return '#3b82f6';
    case 'COMPENSATING': return '#f59e0b';
    case 'COMPENSATED': return '#8b5cf6';
    case 'FAILED': return '#ef4444';
    default: return '#6b7280';
  }
}

export default SagaMonitoringDashboard;
```

## 모니터링 시스템 주요 기능

### 1. 실시간 상태 추적

- WebSocket을 통한 라이브 데이터 업데이트
- Saga 진행 상태 실시간 표시
- 단계별 진행률 시각화

### 2. 성능 메트릭 대시보드

- 전체 Saga 수 및 성공률
- 평균 완료 시간 및 처리량
- 상태별 분포 차트

### 3. 상세 Saga 분석

- 개별 Saga의 상세 정보 모달
- 단계별 실행 타임라인
- 오류 내역 및 디버깅 정보

### 4. 알림 및 운영 지원

- 실패 Saga 자동 감지
- 보상 실패 시 수동 개입 알림
- 성능 임계값 모니터링

## 핵심 요점

### 1. 실시간 가시성

모든 Saga의 상태와 진행 상황을 실시간으로 추적하여 운영 투명성 제공

### 2. 직관적 인터페이스

복잡한 Saga 상태를 시각적으로 이해하기 쉬운 대시보드

### 3. 운영 효율성

자동화된 알림과 메트릭을 통한 사전 예방적 문제 해결

### 4. 디버깅 지원

상세한 실행 로그와 오류 정보를 통한 빠른 문제 진단

---

**이전**: [Saga 코레오그래피 구현](04c-saga-choreography.md)  
**다음**: [Saga 베스트 프랙티스](04e-saga-best-practices.md)에서 성공 요인과 주의사항을 학습합니다.
