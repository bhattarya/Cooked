"""The competing model families for the arena (scikit-learn only, fixed hyper-parameters).

Every task is contested by the same four families, ordered from simplest to most complex:

  baseline   what you would say without a model (training prevalence, class priors, median)
  linear     logistic regression, or one linear quantile regression per quantile
  forest     random forest (quantiles from out-of-bag residuals, since forests have no native ones)
  boosting   histogram gradient boosting, the model COOKED shipped before the arena existed

Hyper-parameters are fixed here and nothing is tuned on the test holdout. The boosting settings
predate the arena (earlier tuning history is not recorded); the others are conventional defaults
with leaf sizes chosen to keep the frozen artifact small. One disclosed exception: the linear
quantile regressors carry a small L1 penalty because a first, unpenalised version paired huge
opposite weights on two 97%-correlated features (att_mean, earned_mean). That was decided from
the training-set coefficients, not from holdout scores.
"""

from __future__ import annotations

import weakref

import numpy as np
from sklearn.compose import TransformedTargetRegressor
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import (
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import LogisticRegression, QuantileRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from ml.risk_model import QUANTILES, SEED

FAMILIES = ("baseline", "linear", "forest", "boosting")
FAMILY_LABELS = {
    "baseline": "Naive baseline",
    "linear": "Linear model",
    "forest": "Random forest",
    "boosting": "Gradient boosting",
}

# what each family is, per task, in plain words
KINDS = {
    "risk": {
        "baseline": "Training-set prevalence (the same probability for everyone)",
        "linear": "Logistic regression on standardised features, Platt-calibrated",
        "forest": "Random forest, Platt-calibrated",
        "boosting": "Histogram gradient boosting, Platt-calibrated",
    },
    "time_to_degree": {
        "baseline": "Training-set quantiles (the same range for everyone)",
        "linear": "Linear quantile regression, one model per quantile",
        "forest": "Random forest median plus out-of-bag residual quantiles",
        "boosting": "Histogram gradient boosting with quantile loss",
    },
    "career": {
        "baseline": "Training-set class frequencies (the same odds for everyone)",
        "linear": "Multinomial logistic regression on standardised features",
        "forest": "Random forest",
        "boosting": "Histogram gradient boosting",
    },
    "salary": {
        "baseline": "Training-set quantiles (the same range for everyone)",
        "linear": "Linear quantile regression, one model per quantile",
        "forest": "Random forest median plus out-of-bag residual quantiles",
        "boosting": "Histogram gradient boosting with quantile loss",
    },
}

PARAMS = {
    "risk": {
        "linear": {"C": 1.0, "max_iter": 2000},
        "forest": {"n_estimators": 100, "min_samples_leaf": 25, "max_features": 0.5},
        "boosting": {
            "max_iter": 150, "learning_rate": 0.05, "max_leaf_nodes": 7,
            "l2_regularization": 5.0, "min_samples_leaf": 40,
        },
    },
    "time_to_degree": {
        "linear": {"alpha": 0.001, "solver": "highs"},
        "forest": {"n_estimators": 100, "min_samples_leaf": 20, "max_features": 0.5},
        "boosting": {"max_iter": 250, "learning_rate": 0.05, "max_leaf_nodes": 15},
    },
    "career": {
        "linear": {"C": 1.0, "max_iter": 2000},
        "forest": {"n_estimators": 100, "min_samples_leaf": 30, "max_features": 0.5},
        "boosting": {
            "max_iter": 180, "learning_rate": 0.05, "max_leaf_nodes": 12,
            "l2_regularization": 4.0, "min_samples_leaf": 35,
        },
    },
    "salary": {
        "linear": {"alpha": 0.001, "solver": "highs"},
        "forest": {"n_estimators": 100, "min_samples_leaf": 20, "max_features": 0.5},
        "boosting": {
            "max_iter": 220, "learning_rate": 0.05, "max_leaf_nodes": 15,
            "l2_regularization": 3.0, "min_samples_leaf": 30,
        },
    },
}


def hyperparameters(task: str, family: str) -> dict:
    """The fixed settings of one candidate, for the arena report."""
    if family == "baseline":
        return {}
    params = dict(PARAMS[task][family])
    if family == "linear" and task in ("time_to_degree", "salary"):
        params["standardised_target"] = True
    if family == "forest":
        params["oob_residual_quantiles"] = task in ("time_to_degree", "salary")
    return {**params, "random_state": SEED}


class ConstantQuantile:
    """Naive baseline: always predicts one training quantile."""

    def __init__(self, q: float):
        self.q = q

    def fit(self, X, y):
        self.value_ = float(np.quantile(y, self.q))
        return self

    def predict(self, X):
        return np.full(len(X), self.value_)


_LAST_FOREST_PREDICTION: weakref.WeakKeyDictionary = weakref.WeakKeyDictionary()


class ForestQuantile:
    """One quantile of a shared random forest: its prediction plus an out-of-bag residual offset.

    The three quantiles share one forest, so its last prediction is remembered (outside the
    pickle): scoring a scenario at p25, p50 and p75 walks the trees once, not three times.
    """

    def __init__(self, forest: RandomForestRegressor, offset: float):
        self.forest = forest
        self.offset = offset

    def predict(self, X):
        key = np.ascontiguousarray(X, dtype=float).tobytes()
        last = _LAST_FOREST_PREDICTION.get(self.forest)
        if last is None or last[0] != key:
            last = (key, self.forest.predict(X))
            _LAST_FOREST_PREDICTION[self.forest] = last
        return last[1] + self.offset


def make_classifier(task: str, family: str):
    """An unfitted classifier for `risk` or `career`."""
    if family == "baseline":
        return DummyClassifier(strategy="prior")
    params = PARAMS[task][family]
    if family == "linear":
        return make_pipeline(StandardScaler(), LogisticRegression(random_state=SEED, **params))
    if family == "forest":
        return RandomForestClassifier(random_state=SEED, n_jobs=1, **params)
    return HistGradientBoostingClassifier(random_state=SEED, **params)


def fit_quantiles(task: str, family: str, X, y, quantiles=QUANTILES) -> dict[float, object]:
    """Fitted models keyed by quantile for `time_to_degree` or `salary`; each has .predict(X)."""
    if family == "baseline":
        return {q: ConstantQuantile(q).fit(X, y) for q in quantiles}
    params = PARAMS[task][family]
    if family == "linear":
        # a small L1 penalty on a standardised target: att_mean and earned_mean are 97% correlated,
        # and without it the fit pairs huge opposite weights on them, which shatters off-manifold
        return {
            q: TransformedTargetRegressor(
                regressor=make_pipeline(StandardScaler(), QuantileRegressor(quantile=q, **params)),
                transformer=StandardScaler(),
            ).fit(X, y)
            for q in quantiles
        }
    if family == "forest":
        forest = RandomForestRegressor(
            random_state=SEED, n_jobs=1, oob_score=True, **params
        ).fit(X, y)
        residuals = np.asarray(y, dtype=float) - forest.oob_prediction_
        return {q: ForestQuantile(forest, float(np.quantile(residuals, q))) for q in quantiles}
    return {
        q: HistGradientBoostingRegressor(
            loss="quantile", quantile=q, random_state=SEED, **params
        ).fit(X, y)
        for q in quantiles
    }
