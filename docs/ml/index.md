---
tags:
  - ML
  - Machine Learning
  - Reinforcement Learning
  - Deep Learning
---

# Machine Learning

이 섹션은 머신러닝과 강화학습 알고리즘에 대한 기술 문서를 담고 있습니다. 주로 Deep Q-Networks (DQN)과 Policy Gradient 방법론들을 다룹니다.

## Policy Gradient Methods

정책 기반 강화학습 방법론들에 대한 내용입니다.

- **[REINFORCE](reinforce.md)** - Montecarlo 방법을 이용한 기본적인 정책 경사 알고리즘
- **[Actor Critic](actor-critic.md)** - Value function을 neural network로 근사하는 방법
- **[A2C](a2c.md)** - Advantage Actor-Critic, Advantage function과 Entropy regularization
- **[GAE](gae.md)** - Generalized Advantage Estimation, bias-variance tradeoff 개선
- **[TNPG](tnpg.md)** - Trust Region Natural Policy Gradient, 안정적인 정책 업데이트

## Deep Q-Networks (DQN) Variants

Value 기반 강화학습의 다양한 개선 방법들입니다.

- **[Double DQN](double-dqn.md)** - Action 선택과 evaluation network 분리
- **[Dueling DQN](duel-dqn.md)** - Q-function을 Value와 Advantage로 분해
- **[Prioritized Experience Replay](prioritized-experience-replay.md)** - TD error 기반 경험 우선순위화
- **[Noisy Networks](noisy-net.md)** - Network parameter에 noise 추가로 exploration 개선

## Advanced Methods

여러 기법들을 조합한 고급 알고리즘들입니다.

- **[Rainbow](rainbow.md)** - 6가지 DQN 개선 기법들의 조합
- **[Rainbow Distributional](rainbow-distributional.md)** - Distributional RL을 포함한 Rainbow 구현

## 특징

- 모든 문서는 논문의 핵심 아이디어와 실제 구현 코드를 포함합니다
- PyTorch를 사용한 구현 예제들이 제공됩니다
- 수학적 수식과 함께 직관적인 설명을 제공합니다
- 각 알고리즘의 장단점과 적용 상황을 설명합니다

이 문서들은 강화학습 알고리즘을 이해하고 구현하는데 실용적인 도움을 제공하는 것을 목표로 합니다.