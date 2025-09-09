---
tags:
  - ML
  - Reinforcement Learning
  - Policy Gradient
  - TNPG
  - Trust Region
---

# TNPG (Trust Region Natural Policy Gradient)

먼저 읽고 와주세요 .

[https://reinforcement-learning-kr.github.io/2018/08/23/8_implement/](https://reinforcement-learning-kr.github.io/2018/08/23/8_implement/)

$\eta(\pi) = E_{s_0\sim\rho_0,a_t\sim\pi(\cdot|s_t)}[\sum^{\infty}_{t=0}\gamma^tr_t]$

일반적으로 expected return 은 위의 식처럼 정의 됩니다.

$\eta(\pi)=\eta(\pi_{old})+E_{\tau\sim\pi}[\sum^{\infty}_{t=0}\gamma^tA^{\pi_{old}}(s_t,a_t)]$

또한 old_policy 와 new_policy 의 관계식을 위처럼 쓸 수 있습니다.

즉

$\eta(\pi)=const+E_{s\sim\pi,a\sim\pi}[A^{\pi_{old}}(s,a)] = E_{s\sim\pi,a\sim\pi_{old}}[\frac {\pi(a|s)} {\pi_{old}(a|s)} A^{\pi_{old}}(s,a)]$

라고 쓸 수 있습니다.

하지만 이것을 구하기는 매우 어렵기 때문에 `surrogate object` 을 도입합니다.

$L(\pi)=E_{s\sim\pi_{old}, a\sim\pi_{old}}[\frac {\pi(a|s)} {\pi_{old}(a|s)} A^{\pi_{old}}(s,a)]$

s가 pi_old 을 따릅니다.

그리고 TRPO 논문에서

$\eta(\pi) \geq L_{\pi_{old}}(\pi) -CD^{max}_{KL}(\pi_{old},\pi)$

로 증명되어 있습니다. 여기서 KL의 max 을 구하기는 힘들기 때문에 KL 의 평균으로 근사합니다.

TRPO 는 KL penalty 을 고정 시키고, hard constraint 을 사용합니다.

TNPG 는 단순하게 이 문제를 최적화 기법을 사용해서 해결합니다.

![[Screenshot2018-11-2923.12.19.png]]

이제 문제는 저 최적해를 구하는 것 입니다. F의 역행렬을 구하는 것은 너무 cost 가 많이 듭니다. 이 문제를 CG(conjugate gradient) 을 사용해서 구할 것 입니다.

CG Damp 는 원래 잇는듯.... 왜지???

혹시라도 `kl_hessian_p` 값이 0일 경우를 방지???

  

  

[https://reinforcement-learning-kr.github.io/2018/06/25/4_npg/](https://reinforcement-learning-kr.github.io/2018/06/25/4_npg/)

[https://papers.nips.cc/paper/2073-a-natural-policy-gradient.pdf](https://papers.nips.cc/paper/2073-a-natural-policy-gradient.pdf)

[https://en.wikipedia.org/wiki/Conjugate_gradient_method](https://en.wikipedia.org/wiki/Conjugate_gradient_method)

[http://rll.berkeley.edu/deeprlcoursesp17/docs/lec5.pdf](http://rll.berkeley.edu/deeprlcoursesp17/docs/lec5.pdf)

[https://github.com/rll/rllab/blob/master/rllab/optimizers/conjugate_gradient_optimizer.py](https://github.com/rll/rllab/blob/master/rllab/optimizers/conjugate_gradient_optimizer.py)