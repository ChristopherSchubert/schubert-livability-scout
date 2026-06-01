#!/usr/bin/env python3
"""
fit_weights.py — Learn the metric weights from YOUR firsthand reactions.

The whole point: stop me (or you) guessing weights. Instead, you rate places
you've actually been to (0-10 how much it gave you "the feeling"), and the
regression finds which measured metrics predict your rating, and how much each
matters. The weights come from your data, not anyone's opinion.

Inputs:
  - measured_metrics.csv  (from measure_places.py — objective numbers)
  - your_ratings.csv      (place, feeling)  <- YOU fill this in for places you've been

Method:
  - Standardize metrics (z-scores) so weights are comparable.
  - Ridge regression (handles few data points + correlated metrics gracefully).
  - Report standardized coefficients = the learned importance of each metric.
  - Leave-one-out CV so you see whether it actually predicts or just memorizes.
  - Then score ALL places (incl. ones you haven't been to) with the learned model.

Honesty notes printed by the script:
  - With < ~8 ratings, weights are suggestive, not reliable. It tells you.
  - It reports how much variance is actually explained (R^2). Low R^2 = the
    measured metrics don't capture your feeling, and no weighting will fix that.
"""
import numpy as np, pandas as pd
from sklearn.linear_model import RidgeCV
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import LeaveOneOut
from sklearn.metrics import r2_score

# ---- DEMO DATA so the script runs today. Replace with real files. -------------
# Pretend measured metrics (z-score-able) and pretend YOUR ratings.
def demo():
    rng=np.random.default_rng(0)
    places=["Piran","Bled","Ljubljana","Shadyside","Lawrenceville","OTR","Tremont","Lancaster"]
    # columns are objective metrics (made up here for demo only)
    data={
      "relief_std_m":   [35,120,40, 6, 8, 20, 55, 5],
      "water_dist_m":   [30, 50,400,3000,1200,1500,600,4000],
      "intersection_den":[180,90,160,140,150,170,120,150],
      "mean_block_m":   [40,90,55,95,85,60,75,70],
      "carfree_frac":   [.9,.4,.7,.05,.05,.45,.2,.3],
      "bldg_coverage":  [.55,.20,.45,.40,.42,.50,.35,.48],
      "daily_needs_n":  [8,5,9,7,6,9,5,8],
      "cafe_n":         [22,10,30,18,16,28,12,20],
    }
    X=pd.DataFrame(data,index=places)
    # YOUR ratings — the only ground truth. (demo values; you replace these)
    y=pd.Series({"Piran":10,"Bled":10,"Ljubljana":8,
                 "Shadyside":3,"Lawrenceville":3,
                 "OTR":None,"Tremont":None,"Lancaster":None})  # None = not been
    return X,y

def load_real():
    X=pd.read_csv("measured_metrics.csv").set_index("place")
    # keep only numeric metric columns
    drop=[c for c in ["lat","lon","radius_m"] if c in X.columns]
    X=X.drop(columns=drop).select_dtypes("number")
    r=pd.read_csv("your_ratings.csv").set_index("place")["feeling"]
    return X, r.reindex(X.index)

def main(use_demo=True):
    X,y = demo() if use_demo else load_real()
    rated = y.dropna()
    if len(rated) < 3:
        print("Need at least 3 rated places to fit anything. You have", len(rated)); return
    Xr = X.loc[rated.index]
    scaler=StandardScaler().fit(Xr)
    Xz=scaler.transform(Xr)
    model=RidgeCV(alphas=np.logspace(-2,3,30)).fit(Xz, rated.values)

    # learned importance
    coef=pd.Series(model.coef_, index=X.columns).sort_values(key=abs, ascending=False)
    print("="*60)
    print(f"FITTED ON {len(rated)} of your firsthand ratings")
    print("="*60)
    print("\nLearned metric importance (standardized coefficients):")
    print("  (+ = more of this raises your feeling; magnitude = how much)\n")
    for k,v in coef.items():
        bar="#"*int(abs(v)*4)
        print(f"  {k:20} {v:+6.2f}  {bar}")

    # honest predictive check
    if len(rated)>=4:
        loo=LeaveOneOut(); preds=[]
        for tr,te in loo.split(Xz):
            m=RidgeCV(alphas=np.logspace(-2,3,30)).fit(Xz[tr],rated.values[tr])
            preds.append(m.predict(Xz[te])[0])
        r2=r2_score(rated.values,preds)
        print(f"\nLeave-one-out predictive R^2 = {r2:.2f}")
        if r2<0.3:
            print("  -> LOW. The measured metrics barely predict your feeling.")
            print("     More metrics or more ratings needed; don't trust the weights yet.")
        elif r2<0.6:
            print("  -> MODERATE. Directionally useful, not precise.")
        else:
            print("  -> STRONG. The model genuinely tracks your reactions.")
    print(f"\nFit R^2 (in-sample) = {model.score(Xz,rated.values):.2f}")
    if len(rated)<8:
        print("\n** CAUTION: <8 ratings. Treat weights as suggestive, not settled. **")

    # score everything, including unrated
    allz=scaler.transform(X)
    score=pd.Series(model.predict(allz), index=X.index).sort_values(ascending=False)
    print("\nPredicted 'feeling' score for ALL places (your model):")
    for k,v in score.items():
        flag="  (rated)" if k in rated.index else ""
        print(f"  {k:16} {v:5.1f}{flag}")

if __name__=="__main__":
    import sys
    main(use_demo=("--real" not in sys.argv))
