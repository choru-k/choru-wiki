---
tags:
  - ML
  - Reinforcement Learning
  - Policy Gradient
---

# REINFORCE

Q값을 Montecarlo Search 을 이용해서 처리.

$\Delta \theta_t = \alpha , abla_{\theta}log\pi_{\theta}(s_t,a_t)v_t$

v 는 Q의 unbiased 한 샘플. 즉 경험적으로 구한 Q값.

```Python
memory = []
while not done:
  steps += 1

    action = net.get_action(state)
    next_state, reward, done, _ = env.step(action)

    next_state = torch.Tensor(next_state)
    next_state = next_state.unsqueeze(0)

    mask = 0 if done else 1
    reward = reward if not done or score == 499 else -1

    memory.append([state, next_state, action, reward, mask])

    score += reward
    state = next_state
```

한 episode 의 샘플을 전부다 memory 에 저장.

```Python
sum_reward = 0
memory.reverse()
for t, transition in enumerate(memory):
    _, _, _, reward, _ = transition
    sum_reward = (reward + gamma * sum_reward)
    loss = QNet.train_model(net, optimizer, transition, sum_reward)
```

sum_reward 을 구함. (v 를 뜻함)

그리고

```Python
def train_model(cls, net, optimizer, transition, reward):
        state, next_state, action, _, mask = transition

        policy = net(state)
        policy = policy.view(-1, net.num_outputs)

        log_policy = torch.log(policy[0])[action]

        loss = - log_policy * reward

        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        return loss
```

`-log_policy * reward` 가 loss 로써 이걸로 policy 을 업데이트 시킴. 실제로 우리는 reward의 기댓값을 maximize 을 하고 싶기 때문에 마이너스 을 한 값을 최소화 시키는 방식으로 구현.

## 참고

[https://reinforcement-learning-kr.github.io/2018/06/28/1_sutton-pg/](https://reinforcement-learning-kr.github.io/2018/06/28/1_sutton-pg/)

[https://dnddnjs.gitbooks.io/rl/content/numerical_methods.html](https://dnddnjs.gitbooks.io/rl/content/numerical_methods.html)
