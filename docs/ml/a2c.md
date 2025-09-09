---
tags:
  - ML
  - Reinforcement Learning
  - A2C
  - Advantage
---

# A2C (Advantage Actor-Critic)

Advantage = Q - V

  

Q와 V 를 둘 다 학습시키는건 불필요.

$Q(s,a) = E[r + \gamma V(s')]$

$Q-V = r + \gamma V(s') - V(s) = td\ error$

Entropy Loss Function 을 도입. Explore 을 위해서

  

$H(X) = -SumP(x)log(P(x))$

[https://camo.githubusercontent.com/014682a3a207e3ad45733c11e17a526fc04e03cd/68747470733a2f2f75706c6f61642e77696b696d656469612e6f72672f77696b6970656469612f636f6d6d6f6e732f7468756d622f322f32322f42696e6172795f656e74726f70795f706c6f742e7376672f33303070782d42696e6172795f656e74726f70795f706c6f742e7376672e706e67](https://camo.githubusercontent.com/014682a3a207e3ad45733c11e17a526fc04e03cd/68747470733a2f2f75706c6f61642e77696b696d656469612e6f72672f77696b6970656469612f636f6d6d6f6e732f7468756d622f322f32322f42696e6172795f656e74726f70795f706c6f742e7376672f33303070782d42696e6172795f656e74726f70795f706c6f742e7376672e706e67)

이런 Image 가 됨. 즉 P 가 어느 한쪽으로 치우치게 된다면 작아지고, P가 커진다면 그건 불확정성을 증가시킨다고 볼 수 있음. 우리는 entropy 에 마이너스를 붙이고 이걸 최소화 시키기 때문에 실제로는 entropy 을 증가시키는 방향으로 계속 업뎃을 하고 있고 그건 P의 불확정성을 증가시키고 결국 좀더 explore 가 잘 되게 만든다고 이해