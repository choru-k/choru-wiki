---
tags:
  - ML
  - Reinforcement Learning
  - GAE
  - Generalized Advantage Estimation
---

# GAE (Generalized Advantage Estimation)

일반적으로 `V(s)` 값은 항상 `biased` 합니다. gamma 라는 변수가 존재 함으로써 실제로 얻는 reward 와 차이가 생길 수 밖에 없고 이것은 `V(s)` 자체를 `biased` 하게 만듭니다. 만약 gamma 가 1 이라면 `unbiased` 하겠지만 `high variance` 를 가지게 됩니다.

GAE 는 gamma 을 undiscounted MDP에서 variance reduction parameter 로 다룹니다.

$g^{\gamma} = E[\sum^{\infty}_{t=0}A^{\pi, \gamma}(s_t,a_t)\nabla_{\theta}log{\pi_{\theta}(a_t|s_t)}]$

[![](https://www.dropbox.com/s/ra7hxksveg2hz45/figure4.jpg?dl=1)](https://www.dropbox.com/s/ra7hxksveg2hz45/figure4.jpg?dl=1)

k 가 커질수록 bias 는 줄어듭니다. (간단하게 생각해서 더 많은 sample 을 사용하고 sample 이 많다는건 variance 는 커지고 bias 는 줄어듭니다.)

[![](https://www.dropbox.com/s/yg1ybmfkep3towu/figure5.jpg?dl=1)](https://www.dropbox.com/s/yg1ybmfkep3towu/figure5.jpg?dl=1)

TD( lambda ) 와 같은 문제가 생기고 결국 이걸 다시 일반화 하기위해서 GAE 가 나오게 됩니다.

이러한 방법으로 최대한 bias 을 줄입니다. 하지만 어떤 lambda, gamma 을 선택해야하는지는 논문에서도 나오지 않습니다.
